
function clamp(x: number, min: number, max: number) : number { return Math.max(Math.min(max, x), min); }

function mix(a: number, b: number, t: number): number {
	t = clamp(t, 0.0, 1.0);
	return (1.0 - t) * a + t * b;
}

function remap(x: number, min0: number, max0: number, min1: number, max1: number) {
	var t = min1 + (x - min0) / (max0 - min0) * (max1 - min1);
	return clamp(t, Math.min(max1, min1), Math.max(max1, min1));
}

function normalize(x: number, min: number, max: number) {
	return remap(x, min, max, 0.0, 1.0);
}


class EaseScalar {
	v0: number;
	v1: number;
	t0: number;
	t1: number;

	constructor(startVal: number, endVal: number, startTime: number, endTime: number) {
		this.v0 = startVal;
		this.v1 = endVal;
		this.t0 = startTime;
		this.t1 = endTime;
	}

	getLinear(currentTime: number) {
		return mix(this.v0, this.v1, normalize(currentTime, this.t0, this.t1));
	}

	getSmooth(currentTime: number) {
		var t = normalize(currentTime, this.t0, this.t1);
		t = t * t * (3.0 - 2.0 * t);
		return mix(this.v0, this.v1, t);
	}

	getPower(currentTime: number, power: number) {
		var t = normalize(currentTime, this.t0, this.t1);
		return mix(this.v0, this.v1, Math.pow(t, power));
	}

}

export default EaseScalar;