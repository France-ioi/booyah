// Based on https://github.com/AndrewRayCode/easing-utils
// No easing, no acceleration
export function linear(t) {
    return t;
}
// Slight acceleration from zero to full speed
export function easeInSine(t) {
    return -1 * Math.cos(t * (Math.PI / 2)) + 1;
}
// Slight deceleration at the end
export function easeOutSine(t) {
    return Math.sin(t * (Math.PI / 2));
}
// Slight acceleration at beginning and slight deceleration at end
export function easeInOutSine(t) {
    return -0.5 * (Math.cos(Math.PI * t) - 1);
}
// Accelerating from zero velocity
export function easeInQuad(t) {
    return t * t;
}
// Decelerating to zero velocity
export function easeOutQuad(t) {
    return t * (2 - t);
}
// Acceleration until halfway, then deceleration
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
// Accelerating from zero velocity
export function easeInCubic(t) {
    return t * t * t;
}
// Decelerating to zero velocity
export function easeOutCubic(t) {
    var t1 = t - 1;
    return t1 * t1 * t1 + 1;
}
// Acceleration until halfway, then deceleration
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}
// Accelerating from zero velocity
export function easeInQuart(t) {
    return t * t * t * t;
}
// Decelerating to zero velocity
export function easeOutQuart(t) {
    var t1 = t - 1;
    return 1 - t1 * t1 * t1 * t1;
}
// Acceleration until halfway, then deceleration
export function easeInOutQuart(t) {
    var t1 = t - 1;
    return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * t1 * t1 * t1 * t1;
}
// Accelerating from zero velocity
export function easeInQuint(t) {
    return t * t * t * t * t;
}
// Decelerating to zero velocity
export function easeOutQuint(t) {
    var t1 = t - 1;
    return 1 + t1 * t1 * t1 * t1 * t1;
}
// Acceleration until halfway, then deceleration
export function easeInOutQuint(t) {
    var t1 = t - 1;
    return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * t1 * t1 * t1 * t1 * t1;
}
// Accelerate exponentially until finish
export function easeInExpo(t) {
    if (t === 0) {
        return 0;
    }
    return Math.pow(2, 10 * (t - 1));
}
// Initial exponential acceleration slowing to stop
export function easeOutExpo(t) {
    if (t === 1) {
        return 1;
    }
    return -Math.pow(2, -10 * t) + 1;
}
// Exponential acceleration and deceleration
export function easeInOutExpo(t) {
    if (t === 0 || t === 1) {
        return t;
    }
    var scaledTime = t * 2;
    var scaledTime1 = scaledTime - 1;
    if (scaledTime < 1) {
        return 0.5 * Math.pow(2, 10 * scaledTime1);
    }
    return 0.5 * (-Math.pow(2, -10 * scaledTime1) + 2);
}
// Increasing velocity until stop
export function easeInCirc(t) {
    var scaledTime = t / 1;
    return -1 * (Math.sqrt(1 - scaledTime * t) - 1);
}
// Start fast, decreasing velocity until stop
export function easeOutCirc(t) {
    var t1 = t - 1;
    return Math.sqrt(1 - t1 * t1);
}
// Fast increase in velocity, fast decrease in velocity
export function easeInOutCirc(t) {
    var scaledTime = t * 2;
    var scaledTime1 = scaledTime - 2;
    if (scaledTime < 1) {
        return -0.5 * (Math.sqrt(1 - scaledTime * scaledTime) - 1);
    }
    return 0.5 * (Math.sqrt(1 - scaledTime1 * scaledTime1) + 1);
}
// Slow movement backwards then fast snap to finish
export function easeInBack(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined
        ? 1.70158
        : arguments[1];
    var scaledTime = t / 1;
    return scaledTime * scaledTime * ((magnitude + 1) * scaledTime - magnitude);
}
// Fast snap to backwards point then slow resolve to finish
export function easeOutBack(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined
        ? 1.70158
        : arguments[1];
    var scaledTime = t / 1 - 1;
    return (scaledTime * scaledTime * ((magnitude + 1) * scaledTime + magnitude) + 1);
}
// Slow movement backwards, fast snap to past finish, slow resolve to finish
export function easeInOutBack(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined
        ? 1.70158
        : arguments[1];
    var scaledTime = t * 2;
    var scaledTime2 = scaledTime - 2;
    var s = magnitude * 1.525;
    if (scaledTime < 1) {
        return 0.5 * scaledTime * scaledTime * ((s + 1) * scaledTime - s);
    }
    return 0.5 * (scaledTime2 * scaledTime2 * ((s + 1) * scaledTime2 + s) + 2);
}
// Bounces slowly then quickly to finish
export function easeInElastic(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined ? 0.7 : arguments[1];
    if (t === 0 || t === 1) {
        return t;
    }
    var scaledTime = t / 1;
    var scaledTime1 = scaledTime - 1;
    var p = 1 - magnitude;
    var s = (p / (2 * Math.PI)) * Math.asin(1);
    return -(Math.pow(2, 10 * scaledTime1) *
        Math.sin(((scaledTime1 - s) * (2 * Math.PI)) / p));
}
// Fast acceleration, bounces to zero
export function easeOutElastic(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined ? 0.7 : arguments[1];
    var p = 1 - magnitude;
    var scaledTime = t * 2;
    if (t === 0 || t === 1) {
        return t;
    }
    var s = (p / (2 * Math.PI)) * Math.asin(1);
    return (Math.pow(2, -10 * scaledTime) *
        Math.sin(((scaledTime - s) * (2 * Math.PI)) / p) +
        1);
}
// Slow start and end, two bounces sandwich a fast motion
export function easeInOutElastic(t) {
    var magnitude = arguments.length <= 1 || arguments[1] === undefined ? 0.65 : arguments[1];
    var p = 1 - magnitude;
    if (t === 0 || t === 1) {
        return t;
    }
    var scaledTime = t * 2;
    var scaledTime1 = scaledTime - 1;
    var s = (p / (2 * Math.PI)) * Math.asin(1);
    if (scaledTime < 1) {
        return (-0.5 *
            (Math.pow(2, 10 * scaledTime1) *
                Math.sin(((scaledTime1 - s) * (2 * Math.PI)) / p)));
    }
    return (Math.pow(2, -10 * scaledTime1) *
        Math.sin(((scaledTime1 - s) * (2 * Math.PI)) / p) *
        0.5 +
        1);
}
// Bounce to completion
export function easeOutBounce(t) {
    var scaledTime = t / 1;
    if (scaledTime < 1 / 2.75) {
        return 7.5625 * scaledTime * scaledTime;
    }
    else if (scaledTime < 2 / 2.75) {
        var scaledTime2 = scaledTime - 1.5 / 2.75;
        return 7.5625 * scaledTime2 * scaledTime2 + 0.75;
    }
    else if (scaledTime < 2.5 / 2.75) {
        var _scaledTime = scaledTime - 2.25 / 2.75;
        return 7.5625 * _scaledTime * _scaledTime + 0.9375;
    }
    else {
        var _scaledTime2 = scaledTime - 2.625 / 2.75;
        return 7.5625 * _scaledTime2 * _scaledTime2 + 0.984375;
    }
}
// Bounce increasing in velocity until completion
export function easeInBounce(t) {
    return 1 - easeOutBounce(1 - t);
}
// Bounce in and bounce out
export function easeInOutBounce(t) {
    if (t < 0.5) {
        return easeInBounce(t * 2) * 0.5;
    }
    return easeOutBounce(t * 2 - 1) * 0.5 + 0.5;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWFzaW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9lYXNpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseURBQXlEO0FBRXpELDZCQUE2QjtBQUM3QixNQUFNLFVBQVUsTUFBTSxDQUFDLENBQVE7SUFDN0IsT0FBTyxDQUFDLENBQUM7QUFDWCxDQUFDO0FBRUQsOENBQThDO0FBQzlDLE1BQU0sVUFBVSxVQUFVLENBQUMsQ0FBUTtJQUNqQyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUM5QyxDQUFDO0FBRUQsaUNBQWlDO0FBQ2pDLE1BQU0sVUFBVSxXQUFXLENBQUMsQ0FBUTtJQUNsQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLENBQUM7QUFFRCxrRUFBa0U7QUFDbEUsTUFBTSxVQUFVLGFBQWEsQ0FBQyxDQUFRO0lBQ3BDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUVELGtDQUFrQztBQUNsQyxNQUFNLFVBQVUsVUFBVSxDQUFDLENBQVE7SUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQztBQUVELGdDQUFnQztBQUNoQyxNQUFNLFVBQVUsV0FBVyxDQUFDLENBQVE7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDckIsQ0FBQztBQUVELGdEQUFnRDtBQUNoRCxNQUFNLFVBQVUsYUFBYSxDQUFDLENBQVE7SUFDcEMsT0FBTyxD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