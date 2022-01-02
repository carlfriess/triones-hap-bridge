const hap = require("hap-nodejs");

const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;

// Generic HomeKit light that uses HSV color controls
class Light {

    constructor(name) {

        this.name = name;

        this.service = new Service.Lightbulb(name, name);
        this.currentBrightness = 100;
        this.targetBrightness = 100;
        this.userBrightness = 100;
        this.currentHue = 0;
        this.targetHue = 0;
        this.currentSaturation = 0;
        this.targetSaturation = 0;
        this.interval = null;
        this.frameInterval = 20;
        this.enableFade = true;

        // Define characteristics for the light service
        const onCharacteristic = this.service.getCharacteristic(Characteristic.On);
        const brightnessCharacteristic = this.service.getCharacteristic(Characteristic.Brightness);
        const hueCharacteristic = this.service.getCharacteristic(Characteristic.Hue);
        const saturationCharacteristic = this.service.getCharacteristic(Characteristic.Saturation);

        onCharacteristic.on(CharacteristicEventTypes.GET, async callback =>
            callback(undefined, await this.getPower()));
        onCharacteristic.on(CharacteristicEventTypes.SET, async (value, callback) => {
            if (value) {
                await this.setPower(true);
                this.targetBrightness = this.userBrightness;
                this.update();
                callback();
            } else {
                if (!this.enableFade) {
                    await this.setPower(false);
                } else {
                    this.targetBrightness = 0;
                    this.update();
                }
                callback();
            }
        });

        brightnessCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetBrightness));
        brightnessCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetBrightness = this.userBrightness = value;
            this.update();
            callback();
        });

        hueCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetHue));
        hueCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetHue = value;
            this.update();
            callback();
        });

        saturationCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetSaturation));
        saturationCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetSaturation = value;
            this.update();
            callback();
        });
    }

    update(next) {

        // If a fade is already running do nothing
        if (!next && this.interval) return;

        // Skip to target if fade is disabled
        if (!this.enableFade) {
            this.currentBrightness = this.targetBrightness;
            this.currentHue = this.targetHue;
            this.currentSaturation = this.targetSaturation;
        }

        // Fade towards target color
        const step = this.frameInterval / 5;
        const diffBrightness = this.targetBrightness - this.currentBrightness;
        this.currentBrightness += Math.sign(diffBrightness) * Math.min(Math.abs(diffBrightness), step);
        const diffHueR = this.targetHue - this.currentHue;
        const diffHueL = diffHueR - Math.sign(diffHueR) * 360;
        const diffHue = Math.abs(diffHueL) < Math.abs(diffHueR) ? diffHueL : diffHueR;
        this.currentHue += Math.sign(diffHue) * Math.min(Math.abs(diffHue), step);
        if (this.currentHue < 0) this.currentHue += 360;
        else if (this.currentHue > 360) this.currentHue -= 360;
        const diffSaturation = this.targetSaturation - this.currentSaturation;
        this.currentSaturation += Math.sign(diffSaturation) * Math.min(Math.abs(diffSaturation), step);

        // Set the color of the light
        this.setColor(this.currentHue, this.currentSaturation, this.currentBrightness);

        // Turn off light when brightness is zero
        if (this.currentBrightness === 0) {
            this.setPower(false);
        }

        if (!this.interval) {
            this.interval = setInterval(() => this.update(true), this.frameInterval);
        }

        if (diffBrightness === 0 && diffHue === 0 && diffSaturation === 0) {
            clearInterval(this.interval)
            this.interval = null;
        }
    }

    // Links this service instance with the given BLE peripheral
    async setPeripheral(peripheral) {
        throw Error("Not Implemented");
    }

    // Returns the power status of the light
    async getPower() {
        throw Error("Not Implemented");
    }

    // Turn the light on or off
    async setPower(on) {
        throw Error("Not Implemented");
    }

    // Set the color of the light using HSV color code
    async setColor(h, s, v) {
        throw Error("Not Implemented");
    }

    // Returns whether a given peripheral is supported
    static supports(peripheral) {
        throw Error("Not Implemented");
    }
}

module.exports = {Light};
