// Geometry
export const EPSILON = 0.001;
export const ZERO = new PIXI.Point(0, 0);
export const ONE = new PIXI.Point(1, 1);
/** Returns a number for x that is between min and max */
export function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
}
/** Returns the vector length of a a PIXI Point */
export function magnitude(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y);
}
/** Returns a copy of the PIXI Point x that has a magnitude between min and max */
export function clampMagnitude(a, min, max) {
    const mag = magnitude(a);
    if (mag < min) {
        return multiply(a, min / mag);
    }
    else if (mag > max) {
        return multiply(a, max / mag);
    }
    else {
        return a;
    }
}
/** Returns the distance between two PIXI Points */
export function distance(a, b) {
    let x = a.x - b.x;
    let y = a.y - b.y;
    return Math.sqrt(x * x + y * y);
}
/** Linear interpolation between numbers a and b, using the fraction p */
export function lerp(a, b, p) {
    return a + (b - a) * p;
}
/** Linear interpolation between points a and b, using the fraction p */
export function lerpPoint(a, b, p) {
    const x = b.x - a.x;
    const y = b.y - a.y;
    return new PIXI.Point(a.x + p * x, a.y + p * y);
}
/** Linear interpolation between arrays a and b, using the fraction p */
export function lerpArray(a, b, p) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
        result.push(lerp(a[i], b[i], p));
    }
    return result;
}
/** Linear interpolation between RGB colors a and b, using the fraction p */
export function lerpColor(a, b, p) {
    // Separate into 3 components
    const aComponents = [(a & 0xff0000) >> 16, (a & 0x00ff00) >> 8, a & 0x0000ff];
    const bComponents = [(b & 0xff0000) >> 16, (b & 0x00ff00) >> 8, b & 0x0000ff];
    return ((lerp(aComponents[0], bComponents[0], p) << 16) |
        (lerp(aComponents[1], bComponents[1], p) << 8) |
        lerp(aComponents[2], bComponents[2], p));
}
/**
 Find the direction around the circle that is shorter
 Based on https://stackoverflow.com/a/2007279
 */
export function angleBetweenAngles(source, target) {
    return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}
/** Linear interpolation between angles a and b, using fraction p */
export function lerpAngle(a, b, p) {
    return a + p * angleBetweenAngles(a, b);
}
/** Returns a copy of a that is > 0 */
export function makeAnglePositive(a) {
    while (a < 0)
        a += 2 * Math.PI;
    return a;
}
/** Normalizes an angle between -pi and pi */
export function normalizeAngle(a) {
    while (a > Math.PI)
        a -= 2 * Math.PI;
    while (a < -Math.PI)
        a += 2 * Math.PI;
    return a;
}
/** Converts radians to degrees */
export function radiansToDegrees(a) {
    return (a * 180) / Math.PI;
}
/** Converts degrees to radians */
export function degreesToRadians(a) {
    return (a * Math.PI) / 180;
}
/** Creates a vector pointing in the direction angle, with the length magnitude */
export function vectorFromAngle(angle, magnitude = 1) {
    return new PIXI.Point(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
}
/** Returns the sum of PIXI points */
export function add(...points) {
    const r = new PIXI.Point();
    for (const p of points) {
        r.x += p.x;
        r.y += p.y;
    }
    return r;
}
/** Returns the difference of PIXI points */
export function subtract(...points) {
    const r = new PIXI.Point(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        r.x -= points[i].x;
        r.y -= points[i].y;
    }
    return r;
}
/** Returns the multiplication of a PIXI point by a scalar */
export function multiply(a, p) {
    return new PIXI.Point(a.x * p, a.y * p);
}
/** Returns the division of a PIXI point by a scalar */
export function divide(a, p) {
    return new PIXI.Point(a.x / p, a.y / p);
}
/** Returns a PIXI point with each element rounded down */
export function floor(p) {
    return new PIXI.Point(Math.floor(p.x), Math.floor(p.y));
}
/** Returns a PIXI point with each element rounded */
export function round(p) {
    return new PIXI.Point(Math.round(p.x), Math.round(p.y));
}
/** Returns a PIXI point that has the minimum of each component */
export function min(...points) {
    const r = new PIXI.Point(Infinity, Infinity);
    for (const p of points) {
        r.x = Math.min(p.x, r.x);
        r.y = Math.min(p.y, r.y);
    }
    return r;
}
/** Returns a PIXI point that has the maximum of each component */
export function max(...points) {
    const r = new PIXI.Point(-Infinity, -Infinity);
    for (const p of points) {
        r.x = Math.max(p.x, r.x);
        r.y = Math.max(p.y, r.y);
    }
    return r;
}
/** Returns true if the point p is between points min and max */
export function inRectangle(p, min, max) {
    return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}
/** Takes the mean of PIXI points */
export function average(...points) {
    let sum = new PIXI.Point();
    for (let point of points)
        sum = add(sum, point);
    return divide(sum, points.length);
}
/**
 Returs a point along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export function moveTowards(a, b, speed) {
    const d = distance(a, b);
    return lerpPoint(a, b, clamp(speed / d, 0, 1));
}
export const moveTowardsPoint = moveTowards;
/**
 Returs an angle between a and b, turning at a given speed.
 Will not "overshoot" b.
 */
export function moveTowardsAngle(a, b, speed) {
    const diff = angleBetweenAngles(a, b);
    if (diff >= 0) {
        const targetDiff = Math.min(diff, speed);
        return a + targetDiff;
    }
    else {
        const targetDiff = Math.min(-diff, speed);
        return a - targetDiff;
    }
}
/**
 Returns a number along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export function moveTowardsScalar(a, b, speed) {
    const d = Math.abs(b - a);
    return lerp(a, b, clamp(speed / d, 0, 1));
}
/** Returns a random number between a amd b */
export function randomInRange(a, b) {
    return a + Math.random() * (b - a);
}
/** Returns a random point between a amd b, with each component considered separately */
export function randomPointInRange(min, max) {
    return new PIXI.Point(randomInRange(min.x, max.x), randomInRange(min.y, max.y));
}
/* Returns true if point is within distance d of otherPoints */
export function withinDistanceOfPoints(point, d, otherPoints) {
    for (const otherPoint of otherPoints) {
        if (distance(point, otherPoint) <= d)
            return true;
    }
    return false;
}
/**
 Returns a point that is a given distance away from of otherPoints.
 Warning: Could loop for a while, maybe forever!
 */
export function randomPointAwayFromOthers(min, max, distanceFromPoints, existingPoints) {
    while (true) {
        const newPoint = randomPointInRange(min, max);
        if (!withinDistanceOfPoints(newPoint, distanceFromPoints, existingPoints))
            return newPoint;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VvbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3R5cGVzY3JpcHQvZ2VvbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxXQUFXO0FBRVgsTUFBTSxDQUFDLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQztBQUM3QixNQUFNLENBQUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN6QyxNQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUV4Qyx5REFBeUQ7QUFDekQsTUFBTSxVQUFVLEtBQUssQ0FBQyxDQUFRLEVBQUUsR0FBVSxFQUFFLEdBQVU7SUFDcEQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxrREFBa0Q7QUFDbEQsTUFBTSxVQUFVLFNBQVMsQ0FBQyxDQUFZO0lBQ3BDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELGtGQUFrRjtBQUNsRixNQUFNLFVBQVUsY0FBYyxDQUFDLENBQVksRUFBRSxHQUFVLEVBQUUsR0FBVTtJQUNqRSxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekIsSUFBSSxHQUFHLEdBQUcsR0FBRyxFQUFFO1FBQ2IsT0FBTyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztLQUMvQjtTQUFNLElBQUksR0FBRyxHQUFHLEdBQUcsRUFBRTtRQUNwQixPQUFPLFFBQVEs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