import * as util from "./util";
import * as entity from "./entity";
import * as audio from "./audio";
// TODO: Once the PR has been accepted, move back to the version from NPM
import preload from "./preload-it.esm";
import * as _ from "underscore";
const DEFAULT_DIRECTIVES = {
    screenSize: new PIXI.Point(960, 540),
    canvasId: "pixi-canvas",
    // Parameters for the game state machine
    states: [],
    transitions: {},
    startingScene: "start",
    startingSceneParams: {},
    startingProgress: {},
    endingScenes: ["end"],
    // Assets
    graphicalAssets: [],
    musicAssets: [],
    fxAssets: [],
    videoAssets: [],
    fontAssets: [],
    jsonAssets: [],
    // For narration
    speakers: {},
    speakerPosition: new PIXI.Point(50, 540),
    // Credits
    credits: {},
    creditsTextSize: 32,
    // Appearance. These assets are automatically added to "graphicalAssets"
    splashScreen: null,
    gameLogo: null,
    extraLogos: [],
    rootConfig: {},
    extraLoaders: [],
    entityInstallers: [],
    language: null,
    supportedLanguages: [],
    menuButtonPosition: null,
    // Standard icons. They will be added to "graphicalAssets"
    graphics: {
        menu: "booyah/images/button-mainmenu.png",
        skip: "booyah/images/button-skip.png",
        play: "booyah/images/button-play.png"
    }
};
const GRAPHICAL_ASSETS = [
    "booyah/images/a-playcurious-game.png",
    "booyah/images/button-back.png",
    "booyah/images/button-close.png",
    "booyah/images/button-replay.png",
    "booyah/images/fullscreen-off.png",
    "booyah/images/fullscreen-on.png",
    "booyah/images/fullscreen-disabled.png",
    "booyah/images/lang-en-off.png",
    "booyah/images/lang-en-on.png",
    "booyah/images/lang-fr-off.png",
    "booyah/images/lang-fr-on.png",
    "booyah/images/music-off.png",
    "booyah/images/music-on.png",
    "booyah/images/subtitles-off.png",
    "booyah/images/subtitles-on.png",
    "booyah/images/voices-off.png",
    "booyah/images/voices-on.png"
];
// String of characters to look for in a font
const FONT_OBSERVER_CHARS = "asdf";
const PRELOADER_ASSETS = [
    "booyah/images/loader-circle.png",
    "booyah/images/loader-error.png"
];
const LOADING_SCENE_SPIN_SPEED = Math.PI / 60; // One spin in 2s
const rootConfig = {
    directives: null,
    app: null,
    preloader: null,
    container: null,
    playOptions: null,
    musicAudio: {},
    videoAssets: {},
    jsonAssets: {},
    fxAudio: null,
    gameStateMachine: null,
    menu: null
};
let loadingScene;
let rootEntity;
let lastFrameTime = 0;
let previousGameState = null;
let gameState = "preloading";
let playTime = 0;
let timeSinceStart = 0;
let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let fixedAudioLoaderProgress = 0;
let videoLoaderProgress = 0;
let variableAudioLoaderProgress = 0;
// Only send updates on non-paused entties
class FilterPauseEntity extends entity.CompositeEntity {
    update(options) {
        if (options.gameState == "playing")
            super.update(options);
    }
}
export class PlayOptions extends PIXI.utils.EventEmitter {
    constructor(directives, searchUrl) {
        super();
        this.options = {
            musicOn: true,
            fxOn: true,
            showSubtitles: true,
            sceneParams: directives.startingSceneParams,
            scene: directives.startingScene,
            startingProgress: directives.startingProgress
        };
        const searchParams = new URLSearchParams(searchUrl);
        if (searchParams.has("music"))
            this.options.musicOn = util.stringToBool(searchParams.get("music"));
        if (searchParams.has("fx"))
            this.options.fxOn = util.stringToBool(searchParams.get("fx"));
        if (searchParams.has("subtitles"))
            this.options.showSubtitles = util.stringToBool(searchParams.get("subtitles"));
        if (searchParams.has("scene"))
            this.options.scene = searchParams.get("scene");
        if (searchParams.has("params"))
            this.options.sceneParams = JSON.parse(searchParams.get("params"));
        if (searchParams.has("progress"))
            this.options.startingProgress = JSON.parse(searchParams.get("progress"));
        if (searchParams.has("mute") &&
            util.stringToBool(searchParams.get("mute"))) {
            this.options.musicOn = false;
            this.options.fxOn = false;
        }
    }
    setOption(name, value) {
        //@ts-ignore
        this.options[name] = value;
        this.emit(name, value);
        this.emit("change", name, value);
    }
    getOption(name) {
        //@ts-ignore
        return this.options[name];
    }
}
export class MenuEntity extends entity.ParallelEntity {
    _setup(config) {
        this.container = new PIXI.Container();
        this.container.name = "menu";
        this.creditsEntity = null;
        this.pauseButton = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.menu].texture);
        this.pauseButton.anchor.set(0.5);
        if (this.config.directives.menuButtonPosition) {
            this.pauseButton.position = this.config.directives.menuButtonPosition;
        }
        else {
            this.pauseButton.position.set(this.config.app.renderer.width - 50, 50);
        }
        this.pauseButton.interactive = true;
        this._on(this.pauseButton, "pointertap", this._onPause);
        this.container.addChild(this.pauseButton);
        this.menuLayer = new PIXI.Container();
        this.menuLayer.visible = false;
        this.container.addChild(this.menuLayer);
        this.mask = new PIXI.Graphics();
        this.mask.beginFill(0x000000);
        this.mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
        this.mask.endFill();
        this.mask.alpha = 0.8;
        this.mask.interactive = true;
        this.menuLayer.addChild(this.mask);
        this.menuButtonLayer = new PIXI.Container();
        this.menuLayer.addChild(this.menuButtonLayer);
        this.playButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-close.png"].texture);
        this.playButton.anchor.set(0.5);
        this.playButton.position.set(this.config.app.renderer.width - 50, 50);
        this.playButton.interactive = true;
        this._on(this.playButton, "pointertap", this._onPlay);
        this.menuButtonLayer.addChild(this.playButton);
        const menuButtonLayerConfig = _.extend({}, this.config, {
            container: this.menuButtonLayer
        });
        if (this.config.directives.gameLogo) {
            const gameLogo = new PIXI.Sprite(this.config.preloader.resources[this.config.directives.gameLogo].texture);
            gameLogo.position.set(170, 200);
            gameLogo.anchor.set(0.5, 0.5);
            this.menuButtonLayer.addChild(gameLogo);
        }
        const pcLogo = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/a-playcurious-game.png"].texture);
        pcLogo.anchor.set(0.5, 1);
        pcLogo.position.set(170, 450);
        this.menuButtonLayer.addChild(pcLogo);
        if (this.config.directives.extraLogos) {
            // Divide space, align to the right
            const spacePerLogo = (this.config.app.renderer.width - 160 * 2) /
                this.config.directives.extraLogos.length;
            for (let i = 0; i < this.config.directives.extraLogos.length; i++) {
                const logoSprite = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.extraLogos[i]].texture);
                logoSprite.anchor.set(0.5, 1);
                logoSprite.position.set(this.config.app.renderer.width - 160 - spacePerLogo * i, 420);
                this.menuButtonLayer.addChild(logoSprite);
            }
        }
        if (util.supportsFullscreen(document.getElementById("game-parent"))) {
            this.fullScreenButton = new entity.ToggleSwitch({
                onTexture: this.config.app.loader.resources["booyah/images/fullscreen-on.png"].texture,
                offTexture: this.config.app.loader.resources["booyah/images/fullscreen-off.png"].texture,
                isOn: false,
                position: new PIXI.Point(405, 130)
            });
            this._on(this.fullScreenButton, "change", this._onChangeFullScreen);
            this.fullScreenButton.setup(menuButtonLayerConfig);
            this.addEntity(this.fullScreenButton);
            // TODO: use event listener to check if full screen was exited manually with ESC key
        }
        else {
            const fullScreenButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/fullscreen-disabled.png"].texture);
            fullScreenButton.position.set(405, 130);
            this.menuButtonLayer.addChild(fullScreenButton);
        }
        this.musicButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/music-on.png"]
                .texture,
            offTexture: this.config.app.loader.resources["booyah/images/music-off.png"].texture,
            isOn: this.config.playOptions.options.musicOn,
            position: new PIXI.Point(405, 230)
        });
        this._on(this.musicButton, "change", this._onChangeMusicIsOn);
        this.musicButton.setup(menuButtonLayerConfig);
        this.addEntity(this.musicButton);
        // TODO prevent being able to turn both subtitles and sound off
        this.fxButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/voices-on.png"]
                .texture,
            offTexture: this.config.app.loader.resources["booyah/images/voices-off.png"].texture,
            isOn: this.config.playOptions.options.fxOn,
            position: new PIXI.Point(630, 230)
        });
        this._on(this.fxButton, "change", this._onChangeFxIsOn);
        this.fxButton.setup(menuButtonLayerConfig);
        this.addEntity(this.fxButton);
        this.subtitlesButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/subtitles-on.png"].texture,
            offTexture: this.config.app.loader.resources["booyah/images/subtitles-off.png"].texture,
            isOn: this.config.playOptions.options.showSubtitles,
            position: new PIXI.Point(630, 130)
        });
        this._on(this.subtitlesButton, "change", this._onChangeShowSubtitles);
        this.subtitlesButton.setup(menuButtonLayerConfig);
        this.addEntity(this.subtitlesButton);
        const creditLink = new PIXI.Text("Credits", {
            fontFamily: "Roboto Condensed",
            fontSize: 32,
            fill: "white",
            strokeThickness: 4
        });
        creditLink.anchor.set(0.5, 0.5);
        creditLink.position.set(this.config.app.renderer.width / 2 - 10, 492);
        creditLink.interactive = true;
        this._on(creditLink, "pointertap", this._showCredits);
        this.menuButtonLayer.addChild(creditLink);
        // Language switching buttons
        if (this.config.directives.supportedLanguages) {
            for (let i = 0; i < this.config.directives.supportedLanguages.length; i++) {
                const language = this.config.directives.supportedLanguages[i];
                const isSelected = language === this.config.directives.language;
                const sprite = new PIXI.Sprite(this.config.app.loader.resources[`booyah/images/lang-${language}-${isSelected ? "off" : "on"}.png`].texture);
                sprite.position.set(405 + i * 100, 330);
                if (!isSelected) {
                    sprite.interactive = true;
                    this._on(sprite, "pointertap", () => this._onSwitchLanguage(language));
                }
                this.menuButtonLayer.addChild(sprite);
            }
            this.switchLanguageConfirmLayer = new PIXI.Container();
            this.switchLanguageConfirmLayer.visible = false;
            this.menuLayer.addChild(this.switchLanguageConfirmLayer);
            const mask = new PIXI.Graphics();
            mask.beginFill(0x000000);
            mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
            mask.endFill();
            mask.alpha = 0.8;
            mask.interactive = true;
            this.switchLanguageConfirmLayer.addChild(mask);
            this.confirmLanguageButton = new PIXI.Sprite();
            this.confirmLanguageButton.anchor.set(0.5);
            this.confirmLanguageButton.scale.set(1.5);
            this.confirmLanguageButton.position.set(this.config.app.renderer.width / 2, this.config.app.renderer.height / 2);
            this.confirmLanguageButton.interactive = true;
            // Event handler is added later, in _onSwitchLanguage()
            this.switchLanguageConfirmLayer.addChild(this.confirmLanguageButton);
            const cancelSwitchLanguageButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
            cancelSwitchLanguageButton.anchor.set(0.5);
            cancelSwitchLanguageButton.position.set(50);
            cancelSwitchLanguageButton.interactive = true;
            this._on(cancelSwitchLanguageButton, "pointertap", this._onCancelSwitchLanguage);
            this.switchLanguageConfirmLayer.addChild(cancelSwitchLanguageButton);
        }
        // Restart button
        {
            this.resetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
            this.resetButton.scale.set(0.58); // From 102 to 60 px
            this.resetButton.anchor.set(0.5);
            this.resetButton.position.set(50, 50);
            this.resetButton.interactive = true;
            this._on(this.resetButton, "pointertap", this._onReset);
            this.menuButtonLayer.addChild(this.resetButton);
            this.resetConfirmLayer = new PIXI.Container();
            this.resetConfirmLayer.visible = false;
            this.menuLayer.addChild(this.resetConfirmLayer);
            this.resetMask = new PIXI.Graphics();
            this.resetMask.beginFill(0x000000);
            this.resetMask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
            this.resetMask.endFill();
            this.resetMask.alpha = 0.8;
            this.resetMask.interactive = true;
            this.resetConfirmLayer.addChild(this.resetMask);
            this.confirmResetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
            this.confirmResetButton.anchor.set(0.5);
            this.confirmResetButton.position.set(this.config.app.renderer.width / 2, this.config.app.renderer.height / 2);
            this.confirmResetButton.interactive = true;
            this._on(this.confirmResetButton, "pointertap", this._onConfirmReset);
            this.resetConfirmLayer.addChild(this.confirmResetButton);
            const cancelResetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
            cancelResetButton.anchor.set(0.5);
            cancelResetButton.position.set(50);
            cancelResetButton.interactive = true;
            this._on(cancelResetButton, "pointertap", this._onCancelReset);
            this.resetConfirmLayer.addChild(cancelResetButton);
        }
        this.config.container.addChild(this.container);
    }
    _update(options) {
        if (this.creditsEntity) {
            if (this.creditsEntity.requestedTransition) {
                this.removeEntity(this.creditsEntity);
                this.creditsEntity = null;
            }
        }
    }
    _teardown() {
        this.config.container.removeChild(this.container);
    }
    _onPause() {
        this.pauseButton.visible = false;
        this.menuLayer.visible = true;
        this.emit("pause");
    }
    _onPlay() {
        this.pauseButton.visible = true;
        this.menuLayer.visible = false;
        this.emit("play");
    }
    _onChangeFullScreen(turnOn) {
        if (turnOn)
            util.requestFullscreen(document.getElementById("game-parent"));
        else
            util.exitFullscreen();
    }
    _onChangeMusicIsOn(isOn) {
        this.config.playOptions.setOption("musicOn", isOn);
    }
    _onChangeFxIsOn(isOn) {
        this.config.playOptions.setOption("fxOn", isOn);
    }
    _onChangeShowSubtitles(showSubtitles) {
        this.config.playOptions.setOption("showSubtitles", showSubtitles);
    }
    _onReset() {
        this.resetConfirmLayer.visible = true;
    }
    _onCancelReset() {
        this.resetConfirmLayer.visible = false;
    }
    _onConfirmReset() {
        this.pauseButton.visible = true;
        this.menuLayer.visible = false;
        this.resetConfirmLayer.visible = false;
        this.emit("reset");
    }
    _showCredits() {
        this.creditsEntity = new CreditsEntity();
        this.addEntity(this.creditsEntity);
    }
    _onSwitchLanguage(language) {
        this.confirmLanguageButton.texture = this.config.app.loader.resources[`booyah/images/lang-${language}-on.png`].texture;
        this._on(this.confirmLanguageButton, "pointertap", () => this._onConfirmSwitchLanguage(language));
        this.switchLanguageConfirmLayer.visible = true;
    }
    _onConfirmSwitchLanguage(language) {
        // Make URL with a different language
        // IDEA: use the current progress of the game, from the game state machine?
        const url = new URL(window.location.href);
        url.searchParams.set("lang", language);
        //@ts-ignore
        window.location = url;
    }
    _onCancelSwitchLanguage() {
        this._off(this.confirmLanguageButton, "pointertap");
        this.switchLanguageConfirmLayer.visible = false;
    }
}
export function installMenu(rootConfig, rootEntity) {
    rootConfig.menu = new MenuEntity();
    rootEntity.addEntity(rootConfig.menu);
}
export class CreditsEntity extends entity.CompositeEntity {
    _setup(config) {
        this.container = new PIXI.Container();
        let rolesText = '';
        let peopleText = '';
        let didFirstLine = false;
        for (let role in this.config.directives.credits) {
            if (didFirstLine) {
                rolesText += "\n";
                peopleText += "\n";
            }
            else {
                didFirstLine = true;
            }
            rolesText += role;
            // Their could be one person credited (string), or an array
            const people = _.isArray(this.config.directives.credits[role])
                ? this.config.directives.credits[role]
                : [this.config.directives.credits[role]];
            for (let person of people) {
                rolesText += "\n";
                peopleText += person + "\n";
            }
        }
        const mask = new PIXI.Graphics();
        mask.beginFill(0x000000);
        mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
        mask.endFill();
        mask.alpha = 0.8;
        mask.interactive = true;
        this.container.addChild(mask);
        const closeButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
        closeButton.anchor.set(0.5);
        closeButton.position.set(50);
        closeButton.interactive = true;
        this._on(closeButton, "pointertap", () => (this.requestedTransition = true));
        this.container.addChild(closeButton);
        const roles = new PIXI.Text(rolesText, {
            fontFamily: "Roboto Condensed",
            fontSize: this.config.directives.creditsTextSize,
            fill: "white",
            align: "right"
        });
        roles.anchor.set(1, 0.5);
        roles.position.set(this.config.app.renderer.width / 2 - 10, this.config.app.renderer.height / 2);
        this.container.addChild(roles);
        const people = new PIXI.Text(peopleText, {
            fontFamily: "Roboto Condensed",
            fontSize: this.config.directives.creditsTextSize,
            fill: "white",
            align: "left"
        });
        people.anchor.set(0, 0.5);
        people.position.set(this.config.app.renderer.width / 2 + 10, this.config.app.renderer.height / 2);
        this.container.addChild(people);
        this.config.container.addChild(this.container);
    }
    _teardown() {
        this.config.container.removeChild(this.container);
    }
}
export class LoadingScene extends entity.CompositeEntity {
    setup(config) {
        super.setup(config);
        this.progress = 0;
        this.shouldUpdateProgress = true;
        this.container = new PIXI.Container();
        if (this.config.directives.splashScreen) {
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        this.loadingContainer = new PIXI.Container();
        this.container.addChild(this.loadingContainer);
        this.loadingFill = new PIXI.Graphics();
        this.loadingFill.position.set(this.config.app.screen.width / 2 - 50, (this.config.app.screen.height * 3) / 4 - 50);
        this.loadingContainer.addChild(this.loadingFill);
        const loadingFillMask = new PIXI.Graphics();
        loadingFillMask.beginFill(0xffffff);
        loadingFillMask.drawCircle(0, 0, 50);
        loadingFillMask.endFill();
        loadingFillMask.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this.loadingContainer.addChild(loadingFillMask);
        this.loadingFill.mask = loadingFillMask;
        this.loadingCircle = new PIXI.Sprite(this.config.preloader.resources["booyah/images/loader-circle.png"].texture);
        this.loadingCircle.anchor.set(0.5);
        this.loadingCircle.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this.loadingContainer.addChild(this.loadingCircle);
        this.config.container.addChild(this.container);
    }
    update(options) {
        super.update(options);
        this.loadingCircle.rotation += LOADING_SCENE_SPIN_SPEED * options.timeScale;
        if (this.shouldUpdateProgress) {
            const height = this.progress * 100; // Because the graphic happens to be 100px tall
            this.loadingFill.clear();
            this.loadingFill.beginFill(0xffffff);
            this.loadingFill.drawRect(0, 100, 100, -height);
            this.loadingFill.endFill();
            this.shouldUpdateProgress = false;
        }
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
    updateProgress(fraction) {
        this.progress = fraction;
        this.shouldUpdateProgress = true;
    }
}
export class ReadyScene extends entity.CompositeEntity {
    setup(config) {
        super.setup(config);
        this.container = new PIXI.Container();
        if (this.config.directives.splashScreen) {
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.play].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this._on(button, "pointertap", () => (this.requestedTransition = true));
        button.interactive = true;
        this.container.addChild(button);
        this.config.container.addChild(this.container);
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
}
export class LoadingErrorScene extends entity.ParallelEntity {
    _setup() {
        this.container = new PIXI.Container();
        if (this.config.directives.splashScreen) {
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.preloader.resources["booyah/images/loader-error.png"].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this.container.addChild(button);
        this.config.container.addChild(this.container);
    }
    _teardown() {
        this.config.container.removeChild(this.container);
    }
}
export class DoneScene extends entity.CompositeEntity {
    setup(config) {
        super.setup(config);
        this.container = new PIXI.Container();
        if (this.config.directives.splashScreen) {
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this._on(button, "pointertap", () => (this.requestedTransition = true));
        button.interactive = true;
        this.container.addChild(button);
        this.config.container.addChild(this.container);
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
}
function updateLoadingProgress() {
    const progress = (pixiLoaderProgress +
        fontLoaderProgress +
        fixedAudioLoaderProgress +
        variableAudioLoaderProgress +
        videoLoaderProgress) /
        5;
    console.debug("loading progress", progress, {
        pixiLoaderProgress,
        fontLoaderProgress,
        fixedAudioLoaderProgress,
        variableAudioLoaderProgress,
        videoLoaderProgress
    });
    if (loadingScene)
        loadingScene.updateProgress(progress);
}
function pixiLoadProgressHandler(loader, resource) {
    pixiLoaderProgress = loader.progress / 100;
    updateLoadingProgress();
}
function update(timeScale) {
    const frameTime = Date.now();
    const timeSinceLastFrame = frameTime - lastFrameTime;
    lastFrameTime = frameTime;
    // Only count "play time" as compared to clock time
    if (gameState == "playing") {
        playTime += timeSinceLastFrame;
        timeSinceStart += timeSinceLastFrame;
    }
    const options = {
        playTime,
        timeSinceStart,
        timeSinceLastFrame,
        timeScale,
        gameState
    };
    if (previousGameState !== gameState) {
        if (previousGameState == "playing" && gameState == "paused") {
            rootEntity.onSignal("pause");
        }
        else if (previousGameState == "paused" && gameState == "playing") {
            rootEntity.onSignal("play");
        }
        previousGameState = gameState;
    }
    rootEntity.update(options);
    rootConfig.app.renderer.render(rootConfig.app.stage);
}
function changeGameState(newGameState) {
    console.log("switching from game state", gameState, "to", newGameState);
    gameState = newGameState;
    ga("send", "event", "changeGameState", newGameState);
}
function loadFixedAssets() {
    changeGameState("loadingFixed");
    util.endTiming("preload");
    util.startTiming("loadFixed");
    // Load graphical assets
    const pixiLoaderResources = [].concat(GRAPHICAL_ASSETS, _.values(rootConfig.directives.graphics), rootConfig.directives.graphicalAssets);
    rootConfig.app.loader
        .add(pixiLoaderResources)
        .on("progress", pixiLoadProgressHandler);
    const fonts = ["Roboto Condensed", ...rootConfig.directives.fontAssets];
    const fontLoaderPromises = _.map(fonts, name => {
        return new FontFaceObserver(name)
            .load(FONT_OBSERVER_CHARS)
            .then(() => {
            fontLoaderProgress += 1 / fonts.length;
            updateLoadingProgress();
        })
            .catch(e => {
            console.error("Cannot load font", name);
            throw e;
        });
    });
    rootConfig.jsonAssets = {};
    const jsonLoaderPromises = _.map(rootConfig.directives.jsonAssets, (jsonAssetDescription) => {
        if (_.isString(jsonAssetDescription)) {
            return util.loadJson(jsonAssetDescription).then(data => {
                rootConfig.jsonAssets[jsonAssetDescription] = data;
            });
        }
        else if (_.isObject(jsonAssetDescription) &&
            jsonAssetDescription.key &&
            jsonAssetDescription.url) {
            return util.loadJson(jsonAssetDescription.url).then(data => {
                rootConfig.jsonAssets[jsonAssetDescription.key] = data;
            });
        }
        else {
            throw new Error(`Unrecognized JSON asset description '${JSON.stringify(jsonAssetDescription)}'`);
        }
    });
    // Load audio
    rootConfig.musicAudio = audio.makeHowls("music", rootConfig.directives.musicAssets);
    const musicLoadPromises = _.map(rootConfig.musicAudio, audio.makeHowlerLoadPromise);
    rootConfig.fxAudio = audio.makeHowls("fx", rootConfig.directives.fxAssets);
    const fxLoadPromises = _.map(rootConfig.fxAudio, audio.makeHowlerLoadPromise);
    const fixedAudioLoaderPromises = [...musicLoadPromises, ...fxLoadPromises];
    _.each(fixedAudioLoaderPromises, p => p.then(() => {
        fixedAudioLoaderProgress += 1 / fixedAudioLoaderPromises.length;
        updateLoadingProgress();
    }));
    // Load video
    const videoLoaderPromises = [];
    if (rootConfig.directives.videoAssets.length > 0) {
        const videoLoader = preload();
        videoLoader.onprogress = (event) => {
            videoLoaderProgress = event.progress / 100;
            updateLoadingProgress();
        };
        videoLoaderPromises.push(videoLoader
            .fetch(rootConfig.directives.videoAssets.map((name) => `video/${name}`))
            .then((assets) => {
            const videoAssets = {};
            for (const asset of assets) {
                const element = util.makeVideoElement();
                element.src = asset.blobUrl;
                videoAssets[asset.url] = element;
            }
            rootConfig.videoAssets = videoAssets;
        })
            .catch(e => {
            console.error("Cannot load videos", e);
            throw e;
        }));
    }
    const promises = _.flatten([
        util.makePixiLoadPromise(rootConfig.app.loader),
        fontLoaderPromises,
        fixedAudioLoaderPromises,
        jsonLoaderPromises,
        videoLoaderPromises
    ], true);
    return Promise.all(promises).catch(err => {
        console.error("Error loading fixed assets", err);
        throw err;
    });
}
function loadVariable() {
    util.endTiming("loadFixed");
    util.startTiming("loadVariable");
    const loadingPromises = [];
    for (const loader of rootConfig.directives.extraLoaders) {
        // TODO: handle progress
        const newPromise = loader(rootConfig);
        loadingPromises.push(newPromise);
    }
    return Promise.all(loadingPromises).catch(err => {
        console.error("Error in variable loading stage", err);
        throw err;
    });
    // // Load audio
    // narrationAudio = narration.loadNarrationAudio(narrationTable, "fr");
    // const narrationLoadPromises = Array.from(
    //   narrationAudio.values(),
    //   audio.makeHowlerLoadPromise
    // );
    // _.each(narrationLoadPromises, p =>
    //   p.then(() => {
    //     variableAudioLoaderProgress += 1 / narrationLoadPromises.length;
    //     updateLoadingProgress();
    //   })
    // );
    // return Promise.all(narrationLoadPromises).catch(err =>
    //   console.error("Error loading C", err)
    // );
}
function doneLoading() {
    util.endTiming("loadVariable");
    util.startTiming("playing");
    changeGameState("playing");
    // Remove loading screen
    loadingScene.teardown();
    loadingScene = null;
    rootEntity = null;
    // The new rootEntity will contain all the sub entities
    rootEntity = new entity.ParallelEntity();
    // gameSequence will have the ready and done scenes
    const gameSequence = new entity.EntitySequence([new ReadyScene(), rootConfig.gameStateMachine, new DoneScene()], { loop: true });
    // Filter out the pause event for the game sequence
    rootEntity.addEntity(new FilterPauseEntity([
        new entity.ContainerEntity([gameSequence], "gameSequence")
    ]));
    for (const installer of rootConfig.directives.entityInstallers) {
        installer(rootConfig, rootEntity);
    }
    if (rootConfig.menu) {
        rootConfig.menu.on("pause", () => changeGameState("paused"));
        rootConfig.menu.on("play", () => changeGameState("playing"));
        rootConfig.menu.on("reset", () => {
            rootEntity.onSignal("reset");
            changeGameState("playing");
        });
    }
    rootEntity.setup(rootConfig);
}
export function makePreloader(additionalAssets) {
    const loader = new PIXI.Loader();
    loader.add(PRELOADER_ASSETS);
    loader.add(additionalAssets);
    return loader;
}
export function go(directives = {}) {
    _.extend(rootConfig, directives.rootConfig);
    rootConfig.directives = util.deepDefaults(directives, DEFAULT_DIRECTIVES);
    // Process starting options
    rootConfig.playOptions = new PlayOptions(rootConfig.directives, window.location.search);
    rootConfig.gameStateMachine = new entity.StateMachine(rootConfig.directives.states, rootConfig.directives.transitions, {
        startingState: rootConfig.playOptions.options.scene,
        startingStateParams: rootConfig.playOptions.options.sceneParams,
        startingProgress: rootConfig.playOptions.options.startingProgress,
        endingStates: rootConfig.directives.endingScenes
    });
    rootConfig.gameStateMachine.on("stateChange", onGameStateMachineChange);
    rootConfig.app = new PIXI.Application({
        width: rootConfig.directives.screenSize.x,
        height: rootConfig.directives.screenSize.y,
        view: document.getElementById(rootConfig.directives.canvasId)
    });
    rootConfig.container = rootConfig.app.stage;
    ga("send", "event", "loading", "start");
    util.startTiming("preload");
    // Setup preloader
    rootConfig.preloader = makePreloader(_.compact([
        rootConfig.directives.splashScreen,
        rootConfig.directives.gameLogo
    ]));
    const loadingPromise = Promise.all([
        util.makeDomContentLoadPromise(document),
        util.makePixiLoadPromise(rootConfig.preloader)
    ])
        .then(() => {
        // Show loading screen as soon as preloader is done
        loadingScene = new LoadingScene();
        rootEntity = loadingScene;
        // The loading scene doesn't get the full config
        loadingScene.setup(rootConfig);
        rootConfig.app.ticker.add(update);
    })
        .then(() => loadFixedAssets())
        .then(loadVariable)
        .then(doneLoading)
        .catch(err => {
        console.error("Error during load", err);
        // Replace loading scene with loading error
        loadingScene.teardown();
        loadingScene = null;
        rootEntity = new LoadingErrorScene();
        rootEntity.setup(rootConfig);
        throw err;
    });
    return {
        rootConfig,
        rootEntity,
        loadingPromise
    };
}
function onGameStateMachineChange(nextStateName, nextStateParams, previousStateName, previousStateParams) {
    const url = new URL(window.location.href);
    nextStateParams = nextStateParams
        ? removePrivateProperties(nextStateParams)
        : {};
    url.searchParams.set("scene", nextStateName);
    url.searchParams.set("params", JSON.stringify(nextStateParams));
    url.searchParams.set("progress", JSON.stringify(rootConfig.gameStateMachine.progress));
    console.log("New game state:", nextStateName, nextStateParams);
    console.log("New game state link:", url.href);
}
function removePrivateProperties(obj) {
    const result = {};
    for (const key in obj) {
        if (!key.startsWith("_"))
            result[key] = obj[key];
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9veWFoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9ib295YWgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLEtBQUssTUFBTSxTQUFTLENBQUM7QUFFakMseUVBQXlFO0FBQ3pFLE9BQU8sT0FBTyxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBMkNoQyxNQUFNLGtCQUFrQixHQUFPO0lBQzdCLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNwQyxRQUFRLEVBQUUsYUFBYTtJQUV2Qix3Q0FBd0M7SUFDeEMsTUFBTSxFQUFFLEVBQUU7SUFDVixXQUFXLEVBQUUsRUFBRTtJQUNmLGFBQWEsRUFBRSxPQUFPO0lBQ3RCLG1CQUFtQixFQUFFLEVBQUU7SUFDdkIsZ0JBQWdCLEVBQUUsRUFBRTtJQUNwQixZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFFckIsU0FBUztJQUNULGVBQWUsRUFBRSxFQUFFO0lBQ25CLFdBQVcsRUFBRSxFQUFFO0lBQ2YsUUFBUSxFQUFFLEVBQUU7SUFDWixXQUFXLEVBQUUsRUFBRTtJQUNmLFVBQVUsRUFBRSxFQUFFO0lBQ2QsVUFBVSxFQUFFLEVBQUU7SUFFZCxnQkFBZ0I7SUFDaEIsUUFBUSxFQUFFLEVBQUU7SUFDWixlQUFlLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUM7SUFFeEMsVUFBVTtJQUNWLE9BQU8sRUFBRSxFQUFFO0lBQ1gsZUFBZSxFQUFFLEVBQUU7SUFFbkIsd0VBQXdFO0lBQ3hFLFlBQVksRUFBRSxJQUFJO0lBQ2xCLFFBQVEsRUFBRSxJQUFJO0lBQ2QsVUFBVSxFQUFF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