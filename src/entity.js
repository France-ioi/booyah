import * as _ from "underscore";
import * as util from "./util";
export class Transition {
    constructor(name = "done", params = {}) {
        this.name = name;
        this.params = params;
    }
}
export function extendConfig(values) {
    return (config) => _.extend({}, config, values);
}
export function processEntityConfig(config, alteredConfig) {
    if (!alteredConfig)
        return config;
    if (typeof alteredConfig === "function")
        return alteredConfig(config);
    return alteredConfig;
}
/**
 In Booyah, the game is structured as a tree of entities. This is the base class for all entities.

 An entity has the following lifecycle:
 1. It is instantiated using the contructor.
 Only parameters specific to the entity should be passed here.
 The entity should not make any changes to the environment here, it should wait for setup().
 2. setup() is called just once, with a configuration.
 This is when the entity should add dispaly objects  to the scene, or subscribe to events.
 The typical config contains { app, preloader, narrator, jukebox, container }
 3. update() is called one or more times, with options.
 It could also never be called, in case the entity is torn down directly.
 If the entity wishes to be terminated, it should set this.requestedTransition to a truthy value.
 Typical options include { playTime, timeSinceStart, timeSinceLastFrame, timeScale, gameState }
 For more complicated transitions, it can return an object like { name: "", params: {} }
 4. teardown() is called just once.
 The entity should remove any changes it made, such as adding display objects to the scene, or subscribing to events.

 The base class will check that this lifecyle is respected, and will log errors to signal any problems.

 In the case that, subclasses do not need to override these methods, but override the underscore versions of them: _setup(), _update(), etc.
 This ensures that the base class behavior of will be called automatically.
 */
export class Entity extends PIXI.utils.EventEmitter {
    constructor() {
        super(...arguments);
        this._isSetup = false;
        this.eventListeners = [];
    }
    setup(entityConfig, frameInfo) {
        if (this._isSetup) {
            console.error("setup() called twice", this);
            console.trace();
        }
        this._entityConfig = entityConfig;
        this._isSetup = true;
        this.requestedTransition = null;
        this._setup(entityConfig, frameInfo);
    }
    update(frameInfo) {
        if (!this._isSetup) {
            console.error("update() called before setup()", this);
            console.trace();
        }
        this._update(frameInfo);
    }
    teardown(frameInfo) {
        if (!this._isSetup) {
            console.error("teardown() called before setup()", this);
            console.trace();
        }
        this._teardown(frameInfo);
        this._off(); // Remove all event listeners
        this._entityConfig = null;
        this._isSetup = false;
    }
    onSignal(signal, frameInfo, data) {
        if (!this._entityConfig) {
            console.error("onSignal() called before setup()", this);
        }
        this._onSignal(signal, frameInfo, data);
    }
    _on(emitter, event, cb) {
        this.eventListeners.push({ emitter, event, cb });
        emitter.on(event, cb, this);
    }
    // if @cb is null, will remove all event listeners for the given emitter and event
    _off(emitter, event, cb) {
        const props = {
            emitter,
            event,
            cb,
        };
        const [listenersToRemove, listenersToKeep] = _.partition(this.eventListeners, props);
        for (const listener of listenersToRemove)
            listener.emitter.off(listener.event, listener.cb, this);
        this.eventListeners = listenersToKeep;
    }
    _setup(config, frameInfo) { }
    _update(frameInfo) { }
    _teardown(frameInfo) { }
    _onSignal(signal, frameInfo, data) { }
    get entityConfig() {
        return this._entityConfig;
    }
    get isSetup() {
        return this._isSetup;
    }
}
/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class Null extends Entity {
}
/** An entity that returns the requested transition immediately  */
export class Transitory extends Entity {
    constructor(transition = new Transition()) {
        super();
        this.transition = transition;
    }
    _setup() {
        this.requestedTransition = this.transition;
    }
}
class EntityContext {
    constructor(entity, config) {
        this.entity = entity;
        this.config = config;
    }
}
export class BaseComposite extends Entity {
    _activateChildEntity(entityContextDescriptor, frameInfo, params = null) {
        let entityDescriptor;
        let configDescriptor;
        if ("entity" in entityContextDescriptor) {
            entityDescriptor = entityContextDescriptor.entity;
            configDescriptor = entityContextDescriptor.config;
        }
        else {
            entityDescriptor = entityContextDescriptor;
        }
        let entity;
        if (typeof entityDescriptor === "function") {
            entity = entityDescriptor(this, params);
        }
        else if (entityDescriptor instanceof Entity) {
            entity = entityDescriptor;
        }
        else {
            throw new Error(`Unknown type of EntityDescriptor '${entityDescriptor}'`);
        }
        let config = processEntityConfig(this.entityConfig, configDescriptor);
        entity.setup(config, frameInfo);
        return new EntityContext(entity, config);
    }
    _deactivateChildEntity(entityContext, frameInfo) {
        entityContext.entity.teardown(frameInfo);
    }
    _updateChildEntity(entityContext, frameInfo) {
        entityContext.entity.update(frameInfo);
        if (!entityContext.entity.requestedTransition)
            return;
        const transition = entityContext.entity.requestedTransition;
        this._deactivateChildEntity(entityContext, frameInfo);
        return transition;
    }
}
export class ParallelOptions {
    constructor() {
        this.autoTransition = true;
    }
}
/**
 * Allows a bunch of entities to execute in parallel.
 * Updates child entities until they ask for a transition, at which point they are torn down.
 * If autoTransition=true, requests a transition when all child entities have completed.
 */
export class Parallel extends BaseComposite {
    constructor(entityContextDescriptors = [], options = {}) {
        super();
        this.entityContextDescriptors = entityContextDescriptors;
        this.options = { ...options, ...new ParallelOptions() };
    }
    setup(entityConfig, frameInfo) {
        super.setup(entityConfig, frameInfo);
        for (let i = 0; i < this.entityContextDescriptors.length; i++) {
            const entityContextDescriptor = this.entityContextDescriptors[i];
            this.entityContexts.push(this._activateChildEntity(entityContextDescriptor, frameInfo));
        }
    }
    update(frameInfo) {
        super.update(frameInfo);
        for (let i = 0; i < this.entityContexts.length; i++) {
            const entityContext = this.entityContexts[i];
            if (!entityContext)
                continue;
            const transition = this._updateChildEntity(entityContext, frameInfo);
            if (transition) {
                this._deactivateChildEntity(entityContext, frameInfo);
                this.entityContexts[i] = null;
            }
        }
        if (this.options.autoTransition && !_.some(this.entityContexts))
            this.requestedTransition = new Transition();
    }
    teardown(frameInfo) {
        for (let i = 0; i < this.entityContexts.length; i++) {
            const entityContext = this.entityContexts[i];
            if (entityContext) {
                this._deactivateChildEntity(entityContext, frameInfo);
            }
        }
        this.entityContexts = [];
        super.teardown(frameInfo);
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        for (let i = 0; i < this.entityContexts.length; i++) {
            const entityContext = this.entityContexts[i];
            if (entityContext) {
                entityContext.entity.onSignal(signal, frameInfo, data);
            }
        }
    }
    addChildEntity(entityContextDescriptor, frameInfo) {
        this.entityContextDescriptors.push(entityContextDescriptor);
        if (this.isSetup) {
            this.entityContexts.push(this._activateChildEntity(entityContextDescriptor, frameInfo));
        }
    }
    removeChildEntity(entityContextDescriptor, frameInfo) {
        const index = this._getChildEntityIndex(entityContextDescriptor);
        if (this.isSetup && this.entityContexts[index]) {
            this._deactivateChildEntity(this.entityContexts[index], frameInfo);
            this.entityContexts.splice(index, 1);
        }
        this.entityContextDescriptors.splice(index, 1);
    }
    removeAllEntities(frameInfo) {
        for (const entityContext of this.entityContexts) {
            if (entityContext)
                this._deactivateChildEntity(entityContext, frameInfo);
        }
        this.entityContextDescriptors = [];
        this.entityContexts = [];
    }
    activateChildEntity(entityContextDescriptor, frameInfo) {
        if (!this.isSetup)
            return;
        const index = this._getChildEntityIndex(entityContextDescriptor);
        if (this.entityContexts[index]) {
            throw new Error(`Entity is already activated, ${entityContextDescriptor}`);
        }
        this.entityContexts[index] = this._activateChildEntity(entityContextDescriptor, frameInfo);
    }
    deactivateChildEntity(entityContextDescriptor, frameInfo) {
        if (!this.isSetup)
            return;
        const index = this._getChildEntityIndex(entityContextDescriptor);
        if (this.entityContexts[index]) {
            throw new Error(`Entity is already activated, ${entityContextDescriptor}`);
        }
        this._deactivateChildEntity(this.entityContexts[index], frameInfo);
        this.entityContexts[index] = null;
    }
    _getChildEntityIndex(entityContextDescriptor) {
        const index = this.entityContextDescriptors.indexOf(entityContextDescriptor);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        return index;
    }
}
/**
  Runs one child entity after another.
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends Entity {
    constructor(entities, options = {}) {
        super();
        this.entities = entities;
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this.loop = !!options.loop;
    }
    // Does not setup entity
    addEntity(entity) {
        if (this.requestedTransition)
            return;
        this.entities.push(entity);
    }
    skip() {
        if (this.requestedTransition)
            return;
        this._advance({ name: "skip" });
    }
    setup(config) {
        super.setup(config);
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this._activateEntity(0);
    }
    update(options) {
        super.update(options);
        if (this.lastRequestedTransition)
            return;
        const timeSinceChildStart = options.timeSinceStart - this.childStartedAt;
        const childOptions = _.extend({}, options, {
            timeSinceStart: timeSinceChildStart,
        });
        this.lastUpdateOptions = options;
        if (this.currentEntityIndex >= this.entities.length)
            return;
        this.currentEntity.update(childOptions);
        const transition = this.currentEntity.requestedTransition;
        if (transition)
            this._advance(transition);
    }
    teardown() {
        this._deactivateEntity();
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        if (this.requestedTransition)
            return;
        super.onSignal(signal, data);
        this.currentEntity.onSignal(signal, data);
        if (signal === "reset")
            this.restart();
    }
    restart() {
        this._deactivateEntity();
        this.currentEntityIndex = 0;
        this.requestedTransition = false;
        this._activateEntity(0);
    }
    _activateEntity(time) {
        const entityDescriptor = this.entities[this.currentEntityIndex];
        if (_.isFunction(entityDescriptor)) {
            this.currentEntity = entityDescriptor(this);
        }
        else {
            this.currentEntity = entityDescriptor;
        }
        this.currentEntity.setup(this.config);
        this.childStartedAt = time;
    }
    _deactivateEntity() {
        if (this.currentEntity && this.currentEntity.isSetup)
            this.currentEntity.teardown();
    }
    _advance(transition) {
        if (this.currentEntityIndex < this.entities.length - 1) {
            this._deactivateEntity();
            this.currentEntityIndex = this.currentEntityIndex + 1;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else if (this.loop) {
            this._deactivateEntity();
            this.currentEntityIndex = 0;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else {
            this._deactivateEntity();
            this.requestedTransition = transition;
        }
    }
}
/**
  Represents a state machine, where each state has a name, and is represented by an entity.
  Only one state is active at a time.
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it requests a transition with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The transitions are not provided directly by the states (entities) by rather by a transition table provided in the constructor.
  A transition is defined as either a name (string) or { name, params }.
  To use have a transition table within a transition table, use the function makeTransitionTable()
*/
export class StateMachine extends Entity {
    constructor(states, transitions, options = {}) {
        super();
        this.states = states;
        this.transitions = transitions;
        util.setupOptions(this, options, {
            startingState: "start",
            endingStates: ["end"],
            startingStateParams: {},
            startingProgress: {},
        });
    }
    setup(config) {
        super.setup(config);
        this.visitedStates = [];
        this.progress = util.cloneData(this.startingProgress);
        const startingState = _.isFunction(this.startingState)
            ? this.startingState()
            : this.startingState;
        const startingStateParams = _.isFunction(this.startingStateParams)
            ? this.startingStateParams()
            : this.startingStateParams;
        this._changeState(0, startingState, startingStateParams);
    }
    update(options) {
        super.update(options);
        if (!this.state)
            return;
        const timeSinceStateStart = options.timeSinceStart - this.sceneStartedAt;
        const stateOptions = _.extend({}, options, {
            timeSinceStart: timeSinceStateStart,
        });
        this.state.update(stateOptions);
        const requestedTransition = this.state.requestedTransition;
        if (requestedTransition) {
            // Unpack requested transition
            let requestedTransitionName, requestedTransitionParams;
            if (_.isObject(requestedTransition)) {
                requestedTransitionName = requestedTransition.name;
                requestedTransitionParams = requestedTransition.params;
            }
            else {
                requestedTransitionName = requestedTransition;
            }
            let nextStateDescriptor;
            // The transition could directly be the name of another state
            if (_.isString(requestedTransitionName) &&
                requestedTransitionName in this.states &&
                !(this.stateName in this.transitions)) {
                nextStateDescriptor = requestedTransition;
            }
            else if (!(this.stateName in this.transitions)) {
                throw new Error(`Cannot find transition for state '${this.stateName}'`);
            }
            else {
                const transitionDescriptor = this.transitions[this.stateName];
                if (_.isFunction(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor(requestedTransitionName, requestedTransitionParams, this);
                }
                else if (_.isString(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor;
                }
                else {
                    throw new Error(`Cannot decode transition descriptor '${JSON.stringify(transitionDescriptor)}'`);
                }
            }
            // Unpack the next state
            let nextStateName, nextStateParams;
            if (_.isObject(nextStateDescriptor) &&
                _.isString(nextStateDescriptor.name)) {
                nextStateName = nextStateDescriptor.name;
                nextStateParams = nextStateDescriptor.params;
            }
            else if (_.isString(nextStateDescriptor)) {
                nextStateName = nextStateDescriptor;
                nextStateParams = requestedTransition.params; // By default, pass through the params in the requested transition
            }
            else {
                throw new Error(`Cannot decode state descriptor '${JSON.stringify(nextStateDescriptor)}'`);
            }
            this._changeState(options.timeSinceStart, nextStateName, nextStateParams);
        }
    }
    teardown() {
        if (this.state) {
            this.state.teardown();
            this.state = null;
            this.stateName = null;
        }
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        if (this.state)
            this.state.onSignal(signal, data);
    }
    _changeState(timeSinceStart, nextStateName, nextStateParams) {
        // If reached an ending state, stop here. Teardown can happen later
        if (_.contains(this.endingStates, nextStateName)) {
            this.requestedTransition = nextStateName;
            this.visitedStates.push(nextStateName);
            return;
        }
        if (this.state) {
            this.state.teardown();
        }
        if (nextStateName in this.states) {
            const nextStateDescriptor = this.states[nextStateName];
            if (_.isFunction(nextStateDescriptor)) {
                this.state = nextStateDescriptor(nextStateParams, this);
            }
            else {
                this.state = nextStateDescriptor;
            }
            this.state.setup(this.config);
        }
        else {
            throw new Error(`Cannot find state '${nextStateName}'`);
        }
        this.sceneStartedAt = timeSinceStart;
        const previousStateName = this.stateName;
        const previousStateParams = this.stateParams;
        this.stateName = nextStateName;
        this.stateParams = nextStateParams;
        this.visitedStates.push(nextStateName);
        this.emit("stateChange", nextStateName, nextStateParams, previousStateName, previousStateParams);
    }
}
/**
  Creates a transition table for use with StateMachine.
  Example:
    const transitions = {
      start: entity.makeTransitionTable({
        win: "end",
        lose: "start",
      }),
    };
    `
*/
export function makeTransitionTable(table) {
    const f = function (requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams) {
        if (requestedTransitionName in table) {
            const transitionDescriptor = table[requestedTransitionName];
            if (_.isFunction(transitionDescriptor)) {
                return transitionDescriptor(requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams);
            }
            else {
                return transitionDescriptor;
            }
        }
        else {
            throw new Error(`Cannot find state ${requestedTransitionName}`);
        }
    };
    f.table = table; // For debugging purposes
    return f;
}
/* Deprecated for most uses. Instead use ParallelEntity */
export class CompositeEntity extends Entity {
    constructor(entities = []) {
        super();
        this.entities = entities;
    }
    setup(config) {
        super.setup(config);
        for (const entity of this.entities) {
            if (!entity.isSetup) {
                entity.setup(config);
            }
        }
    }
    update(options) {
        super.update(options);
        for (const entity of this.entities) {
            entity.update(options);
        }
        if (this.entities.length && this.entities[0].requestedTransition) {
            this.requestedTransition = this.entities[0].requestedTransition;
        }
    }
    teardown() {
        for (const entity of this.entities) {
            entity.teardown();
        }
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        for (const entity of this.entities) {
            entity.onSignal(signal, data);
        }
    }
    addEntity(entity) {
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            entity.setup(this.config);
        }
        this.entities.push(entity);
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
    }
}
/**
  An entity that gets its behavior from functions provided inline in the constructor.
  Useful for small entities that don't require their own class definition.
  Additionally, a function called requestTransition(options, entity), called after update(), can set the requested transition

  Example usage:
    new FunctionalEntity({
      setup: (config) => console.log("setup", config),
      teardown: () => console.log("teardown"),
    });
*/
export class FunctionalEntity extends ParallelEntity {
    // @functions is an object, with keys: setup, update, teardown, onSignal
    constructor(functions, childEntities = []) {
        super();
        this.functions = functions;
        for (let childEntity of childEntities)
            this.addEntity(childEntity);
    }
    setup(config) {
        super.setup(config);
        if (this.functions.setup)
            this.functions.setup(config, this);
    }
    update(options) {
        super.update(options);
        if (this.functions.update)
            this.functions.update(options, this);
        if (this.functions.requestTransition) {
            this.requestedTransition = this.functions.requestTransition(options, this);
        }
    }
    teardown() {
        if (this.functions.teardown)
            this.functions.teardown(this);
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        if (this.functions.onSignal)
            this.functions.onSignal(signal, data);
    }
}
/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition.
  Optionally takes a @that parameter, which is set as _this_ during the call.
*/
export class FunctionCallEntity extends Entity {
    constructor(f, that) {
        super();
        this.f = f;
        this.that = that;
        this.that = that && this;
    }
    _setup() {
        this.f.call(this.that);
        this.requestedTransition = true;
    }
}
// Waits until time is up, then requests transition
export class WaitingEntity extends Entity {
    /** @wait is in milliseconds */
    constructor(wait) {
        super();
        this.wait = wait;
    }
    _update(options) {
        if (options.timeSinceStart >= this.wait) {
            this.requestedTransition = true;
        }
    }
}
/**
  An entity that manages a PIXI DisplayObject, such as a Sprite or Graphics.
  Useful for automatically adding and removing the DisplayObject to the parent container.
*/
export class DisplayObjectEntity extends Entity {
    constructor(displayObject) {
        super();
        this.displayObject = displayObject;
    }
    _setup(config) {
        this.config.container.addChild(this.displayObject);
    }
    _teardown() {
        this.config.container.removeChild(this.displayObject);
    }
}
/**
  An entity that creates a new PIXI container in the setup config for it's children, and manages the container.
*/
export class ContainerEntity extends ParallelEntity {
    constructor(entities = [], name) {
        super(entities);
        this.name = name;
    }
    setup(config) {
        this.oldConfig = config;
        this.container = new PIXI.Container();
        this.container.name = this.name;
        this.oldConfig.container.addChild(this.container);
        this.newConfig = _.extend({}, config, {
            container: this.container,
        });
        super.setup(this.newConfig);
    }
    teardown() {
        super.teardown();
        this.oldConfig.container.removeChild(this.container);
    }
}
/**
  Manages a video asset. Can optionally loop the video.
  Asks for a transition when the video has ended.
*/
export class VideoEntity extends Entity {
    constructor(videoName, options = {}) {
        super();
        this.videoName = videoName;
        util.setupOptions(this, options, {
            loop: false,
        });
    }
    _setup(config) {
        // This container is used so that the video is inserted in the right place,
        // even if the sprite isn't added until later.
        this.container = new PIXI.Container();
        this.config.container.addChild(this.container);
        this.videoElement = this.config.videoAssets[this.videoName];
        this.videoElement.loop = this.loop;
        this.videoElement.currentTime = 0;
        this.videoSprite = null;
        // videoElement.play() might not return a promise on older browsers
        Promise.resolve(this.videoElement.play()).then(() => {
            // Including a slight delay seems to workaround a bug affecting Firefox
            window.setTimeout(() => this._startVideo(), 100);
        });
    }
    _update(options) {
        if (this.videoElement.ended)
            this.requestedTransition = true;
    }
    _onSignal(signal, frameInfo, data) {
        if (signal === "pause") {
            this.videoElement.pause();
        }
        else if (signal === "play") {
            this.videoElement.play();
        }
    }
    teardown() {
        this.videoElement.pause();
        this.videoSprite = null;
        this.config.container.removeChild(this.container);
        this.container = null;
        super.teardown();
    }
    _startVideo() {
        const videoResource = new PIXI.resources.VideoResource(this.videoElement);
        //@ts-ignore
        this.videoSprite = PIXI.Sprite.from(videoResource);
        this.container.addChild(this.videoSprite);
    }
}
/**
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export class ToggleSwitch extends Entity {
    constructor(options) {
        super();
        util.setupOptions(this, options, {
            onTexture: util.REQUIRED_OPTION,
            offTexture: util.REQUIRED_OPTION,
            isOn: false,
            position: new PIXI.Point(),
        });
    }
    setup(options) {
        super.setup(options);
        this.container = new PIXI.Container();
        this.container.position = this.position;
        this.spriteOn = new PIXI.Sprite(this.onTexture);
        this.spriteOn.interactive = true;
        this._on(this.spriteOn, "pointertap", this._turnOff);
        this.container.addChild(this.spriteOn);
        this.spriteOff = new PIXI.Sprite(this.offTexture);
        this.spriteOff.interactive = true;
        this._on(this.spriteOff, "pointertap", this._turnOn);
        this.container.addChild(this.spriteOff);
        this._updateVisibility();
        this.config.container.addChild(this.container);
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
    setIsOn(isOn, silent = false) {
        this.isOn = isOn;
        this._updateVisibility();
        if (!silent)
            this.emit("change", this.isOn);
    }
    _turnOff() {
        this.isOn = false;
        this._updateVisibility();
        this.emit("change", this.isOn);
    }
    _turnOn() {
        this.isOn = true;
        this._updateVisibility();
        this.emit("change", this.isOn);
    }
    _updateVisibility() {
        this.spriteOn.visible = this.isOn;
        this.spriteOff.visible = !this.isOn;
    }
}
/**
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a transition)
*/
export class AnimatedSpriteEntity extends Entity {
    constructor(animatedSprite) {
        super();
        this.animatedSprite = animatedSprite;
    }
    _setup() {
        if (this.animatedSprite.onComplete)
            console.warn("Warning: overwriting this.animatedSprite.onComplete");
        this.animatedSprite.onComplete = this._onAnimationComplete.bind(this);
        this.config.container.addChild(this.animatedSprite);
        this.animatedSprite.gotoAndPlay(0);
    }
    onSignal(signal, frameInfo, data) {
        if (signal == "pause")
            this.animatedSprite.stop();
        else if (signal == "play")
            this.animatedSprite.play();
    }
    _teardown() {
        this.animatedSprite.stop();
        this.animatedSprite.onComplete = null;
        this.config.container.removeChild(this.animatedSprite);
    }
    _onAnimationComplete() {
        this.requestedTransition = true;
    }
}
export class SkipButton extends Entity {
    setup(config) {
        super.setup(config);
        this.sprite = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.skip].texture);
        this.sprite.anchor.set(0.5);
        this.sprite.position.set(this.config.app.screen.width - 50, this.config.app.screen.height - 50);
        this.sprite.interactive = true;
        this._on(this.sprite, "pointertap", this._onSkip);
        this.config.container.addChild(this.sprite);
    }
    teardown() {
        this.config.container.removeChild(this.sprite);
        super.teardown();
    }
    _onSkip() {
        this.requestedTransition = true;
        this.emit("skip");
    }
}
/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed.
  Instead, entities that have completed are removed after teardown
*/
export class DeflatingCompositeEntity extends Entity {
    /** Options include:
          autoTransition: If true, requests transition when the entity has no children (default true)
    */
    constructor(options = {}) {
        super();
        this.entities = [];
        util.setupOptions(this, options, {
            autoTransition: true,
        });
    }
    setup(config) {
        super.setup(config);
        for (const entity of this.entities) {
            if (!entity.isSetup) {
                entity.setup(config);
            }
        }
    }
    update(options) {
        super.update(options);
        // Slightly complicated for-loop so that we can remove entities that are complete
        for (let i = 0; i < this.entities.length;) {
            const entity = this.entities[i];
            entity.update(options);
            if (entity.requestedTransition) {
                console.debug("Cleanup up child entity", entity);
                if (entity.isSetup) {
                    entity.teardown();
                }
                this.entities.splice(i, 1);
            }
            else {
                i++;
            }
        }
        if (this.autoTransition && this.entities.length == 0) {
            this.requestedTransition = true;
        }
    }
    teardown() {
        for (const entity of this.entities) {
            entity.teardown();
        }
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        for (const entity of this.entities) {
            entity.onSignal(signal, data);
        }
    }
    addEntity(entity) {
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            entity.setup(this.config);
        }
        this.entities.push(entity);
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
    }
}
/**
 * Does not request a transition until done() is called with a given transition
 */
export class Block extends Entity {
    done(transition = true) {
        this.requestedTransition = transition;
    }
}
/**
 * Executes a function once and requests a transition equal to its value.
 */
export class Decision extends Entity {
    constructor(f) {
        super();
        this.f = f;
    }
    _setup() {
        this.requestedTransition = this.f();
    }
}
/**
 * Waits for an event to be delivered, and decides to request a transition depending on the event value.
 * @handler is a function of the event arguments, and should return a transition (or false if no transition)
 */
export class WaitForEvent extends Entity {
    constructor(emitter, eventName, handler = _.constant(true)) {
        super();
        this.emitter = emitter;
        this.eventName = eventName;
        this.handler = handler;
    }
    _setup() {
        this._on(this.emitter, this.eventName, this._handleEvent);
    }
    _handleEvent(...args) {
        this.requestedTransition = this.handler(...args);
    }
}
/**
 * A composite entity that requests a transition as soon as one of it's children requests one
 */
export class Alternative extends Entity {
    // Takes an array of type: { entity, transition } or just entity
    // transition defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
    constructor(entityPairs = []) {
        super();
        this.entityPairs = _.map(entityPairs, (entityPair, key) => {
            if (entityPair instanceof Entity)
                return {
                    entity: entityPair,
                    transition: key.toString(),
                };
            // Assume an object of type { entity, transition }
            return _.defaults({}, entityPair, {
                transition: key.toString(),
            });
        });
    }
    _setup() {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.setup(this.config);
            if (entityPair.entity.requestedTransition)
                this.requestedTransition = entityPair.transition;
        }
    }
    _update(options) {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.update(options);
            if (entityPair.entity.requestedTransition)
                this.requestedTransition = entityPair.transition;
        }
    }
    _teardown() {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.teardown();
        }
    }
}
/**
 * A composite entity in which only entity is active at a time.
 * By default, the first entity is active
 */
export class SwitchingEntity extends Entity {
    constructor() {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.activeEntityIndex = -1;
    }
    setup(config) {
        super.setup(config);
        if (this.entities && this.activeEntityIndex > 0) {
            this.switchToIndex(this.activeEntityIndex);
        }
    }
    update(options) {
        super.update(options);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].update(options);
        }
    }
    teardown() {
        this.switchToIndex(-1);
        super.teardown();
    }
    onSignal(signal, frameInfo, data) {
        super.onSignal(signal, data);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
    }
    switchToIndex(index) {
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].teardown();
        }
        this.activeEntityIndex = index;
        if (this.activeEntityIndex >= 0) {
            const entityConfig = processEntityConfig(this.config, this.entityConfigs[this.activeEntityIndex]);
            this.entities[this.activeEntityIndex].setup(entityConfig);
        }
    }
    switchToEntity(entity) {
        if (entity === null) {
            this.switchToIndex(-1);
        }
        else {
            const index = this.entities.indexOf(entity);
            if (index === -1)
                throw new Error("Cannot find entity");
            this.switchToIndex(index);
        }
    }
    activeEntity() {
        if (this.activeEntityIndex >= 0)
            return this.entities[this.activeEntityIndex];
        return null;
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity");
        if (index === this.activeEntityIndex) {
            this.switchToIndex(-1);
        }
        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
    }
    removeAllEntities() {
        this.switchToIndex(-1);
        this.entities = [];
        this.entityConfigs = [];
        this.activeEntityIndex = -1;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLENBQUMsTUFBTSxZQUFZLENBQUM7QUFDaEMsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFXL0IsTUFBTSxPQUFPLFVBQVU7SUFDckIsWUFBcUIsT0FBZSxNQUFNLEVBQVcsU0FBYSxFQUFFO1FBQS9DLFNBQUksR0FBSixJQUFJLENBQWlCO1FBQVcsV0FBTSxHQUFOLE1BQU0sQ0FBUztJQUFHLENBQUM7Q0FDekU7QUFxQkQsTUFBTSxVQUFVLFlBQVksQ0FBQyxNQUFXO0lBQ3RDLE9BQU8sQ0FBQyxNQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDaEUsQ0FBQztBQU1ELE1BQU0sVUFBVSxtQkFBbUIsQ0FDakMsTUFBb0IsRUFDcEIsYUFBc0M7SUFFdEMsSUFBSSxDQUFDLGFBQWE7UUFBRSxPQUFPLE1BQU0sQ0FBQztJQUNsQyxJQUFJLE9BQU8sYUFBYSxLQUFLLFVBQVU7UUFBRSxPQUFPLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN0RSxPQUFPLGFBQWEsQ0FBQztBQUN2QixDQUFDO0FBVUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7QUFDSCxNQUFNLE9BQWdCLE1BQU8sU0FBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVk7SUFBNUQ7O1FBQ1UsYUFBUSxHQUFHLEtBQUssQ0FBQztRQUdsQixtQkFBYyxHQUFxQixFQUFFLENBQUM7SUEwRi9DLENBQUM7SUF2RlEsS0FBSyxDQUFDLFlBQTBCLEVBQUUsU0FBb0I7UUFDM0QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2pCLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFD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