# Liveswitch Javascript Wrapper

This library provides a wrapper around the [Lveswitch Javascript SDK](https://developer-nightly.liveswitch.io/liveswitch-server/guides/intro.html#javascript-), used for cloud based WebRTC and SIP functionality. More on LiveSwitch can be found [here](https://developer-nightly.liveswitch.io/liveswitch-server/index.html).

## Usage

The liveswitch JS SDK is a script file that is attached the frontend application via a `<script>` tag. It exports and `fm` object that is used by liveswitch-wrapper.

```html
<script src="./lib/fm.liveswitch.js"></script>
```

The library can be used in browser side JS environments as shown below.

```js
import {LiveSwitch} from './liveswitch-wrapper';

const liveswitch = new LiveSwitch({
    applicationId,
    sharedSecret,
    deviceId
});

await liveswitch.register(...)
await liveswitch.joinChannel(...)
```
