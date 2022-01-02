# HomeKit Accessory Bridge for Bluetooth RGBW lights

A bridge implementation allowing various low-cost Bluetooth lighting products to be controlled through HomeKit.

```
npm install
node app.js
```

The default paring code is `123-45-678`.

### Supported Protocols

- Triones RGBW lights ([Protocol Reference](https://gitlab.com/madhead/saberlight/-/blob/master/protocols/Triones/protocol.md))
- ELK-BLEDOM RGB lights ([Protocol Reference](https://github.com/arduino12/ble_rgb_led_strip_controller))

### Bluetooth Setup

Check the [noble documentation](https://github.com/abandonware/noble#installation) for additional setup required for Bluetooth connectivity on your device.
