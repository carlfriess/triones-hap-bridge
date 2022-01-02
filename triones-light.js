const {Light} = require("./light");
const {hsv2rgb} = require("./util");

class TrionesLight extends Light {

    async setPeripheral(peripheral) {
        const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(["ffd0", "ffd5"], ["ffd4", "ffd9"]);
        this.ffd4 = characteristics.filter(c => c.uuid === "ffd4")[0];
        this.ffd9 = characteristics.filter(c => c.uuid === "ffd9")[0];
    }

    async getPower() {
        return await new Promise((res, rej) => {
            this.ffd4.once("data", state => res(state[2] === 0x23));
            this.ffd9.write(Buffer.from([0xEF, 0x01, 0x77]), false);
        });
    }

    async setPower(on) {
        await this.ffd9.writeAsync(Buffer.from([0xCC, on ? 0x23 : 0x24, 0x33]), false);
    }

    async setColor(h, s, v) {
        // Check if we should just use white LEDs
        if (s <= 5) {
            // Write brightness to device in white mode
            await this.ffd9.writeAsync(Buffer.from([0x56, 0xFF, 0xFF, 0xFF, v / 100 * 0xFF, 0x0F, 0xAA]), true);
        } else {
            // Convert colors to RGB values and write to device
            const [r, g, b] = hsv2rgb(h, s / 100, v / 100);
            await this.ffd9.writeAsync(Buffer.from([0x56, r * 0xFF, g * 0xFF, b * 0xFF, 0x00, 0xF0, 0xAA]), true);
        }
    }

    static supports(peripheral) {
        return peripheral.advertisement.localName && peripheral.advertisement.localName.startsWith("Triones-");
    }
}

module.exports = {TrionesLight};