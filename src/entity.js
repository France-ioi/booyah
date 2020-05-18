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
            if (transition)
                this.entityContexts[i] = null;
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