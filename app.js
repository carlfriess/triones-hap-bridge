const _ = require("lodash");
const noble = require("@abandonware/noble");
const {TrionesLight} = require("./triones-light");
const {ElkLight} = require("./elk-light");

function peripheralSupported(peripheral) {
    return TrionesLight.supports(peripheral) || ElkLight.supports(peripheral);
}

function newLight(peripheral, resume) {
    if (TrionesLight.supports(peripheral)) {
        return new TrionesLight(peripheral, resume);
    } else if (ElkLight.supports(peripheral)) {
        return new ElkLight(peripheral, resume);
    } else {
        throw Error("Unsupported peripheral");
    }
}

// Map of known devices and their instances
const lights = {};
const devices = new Set();

// Update lights @ 50Hz until no light require updates anymore
let interval;
function resumeUpdates() {
    if (interval) return;
    interval = setInterval(async () => {
        const done = _.after(Object.keys(lights).length, (busy) => {
            if (!busy) {
                clearInterval(interval);
                interval = null;
            }
        });
        let busy = false;
        for (const key in lights) {
            busy = await lights[key].update() || busy;
            done(busy);
        }
    }, 20);
}

// Wait for Bluetooth adapter to power on and start scanning
noble.on("stateChange", async state => {
    if (state === "poweredOn") {
        await noble.startScanningAsync([], false);
    }
});

// Always restart scanning for devices for the first 60 seconds of execution or if a device is disconnected
let initialScan = true;
function restartScan() {
    if (initialScan || _.difference(Object.keys(lights), [...devices]).length) {
        console.log("Restarting scan...");
        noble.startScanning([], false);
    } else {
        console.log("Stopped scanning");
    }
}
noble.on("scanStop", restartScan);
setTimeout(() => {
    initialScan = false;
    if (!_.difference(Object.keys(lights), [...devices]).length) {
        noble.stopScanning();
    }
}, 60000);

noble.on("discover", async (peripheral) => {

    // Check if we just discovered a supported device
    if (peripheralSupported(peripheral)) {

        const localName = peripheral.advertisement.localName;
        console.log(`${ peripheral.address } (${ localName })`);

        // If we are already connecting or connected to the device do nothing
        if (devices.has(peripheral.address)) return;

        // Connect to device
        console.log(`${ peripheral.address } CONNECTING...`);
        devices.add(peripheral.address);
        try {
            await peripheral.connectAsync();
        } catch (e) {
            console.log(`${ peripheral.address } CONNECT FAILED`);
            devices.delete(peripheral.address);
            return;
        }
        console.log(`${ peripheral.address } CONNECTED`);

        peripheral.on("disconnect", () => {
            console.log(`${ peripheral.address } DISCONNECTED`);
            devices.delete(peripheral.address);
            restartScan();
        });

        // Check if the peripheral has previously been initialized
        if (!lights[peripheral.address]) {

            // Instantiate a new light service and track it
            lights[peripheral.address] = newLight(peripheral, resumeUpdates);

        } else {

            // Update peripheral references
            await lights[peripheral.address].setPeripheral(peripheral);
        }
    }
});
