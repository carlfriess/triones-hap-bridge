// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v) {
    const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
}

function diffHSV(base, target) {
    const diff = target.map((e, i) => e - base[i]);
    const diffHueL = diff[0] - Math.sign(diff[0]) * 360;
    diff[0] = Math.abs(diffHueL) < Math.abs(diff[0]) ? diffHueL : diff[0];
    return diff;
}

module.exports = {hsv2rgb, diffHSV};
