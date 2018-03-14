import {mat4, vec3} from 'gl-matrix';
import EaseScalar from './Animators'

const NUM_LINKS: number = 12;
const NUM_HEX: number = 7;
const HEX_SIZE: number = 6;

// image pattern matching constants
const PATTERNS_2: string[] = ['++', '+-+', '+--+'];
const PATTERNS_3: string[] = ['+++', '++-+', '++--+'];
const PATTERNS_4: string[] = ['++++', '+++-+', '++-++'];
const OFFSET_2: number = 1;
const OFFSET_3: number = 4;
const OFFSET_4: number = 7;
const OFFSET_5: number = 10;
const OFFSET_6: number = 11;

const TURN_DURATION: number = 0.25;

type IdxLink = [number, boolean];

// return the pattern number and the clockwise hex offset
function matchPattern(hexBools: boolean[]): [number, number] {
	// create a string from the booleans
	var str = '';
	var count = 0;
	for (var i = 0; i < HEX_SIZE; i++) {
		if (hexBools[i]) {
			count++;
			str += '+';
		} else str += '-';
	}

	// concatenate to self for looping
	str += str;

	switch(count) {
		case 1: {
			return [0, str.indexOf('+')];
		}
		case 2: {
			for (var i = 0; i < PATTERNS_2.length; i++) {
				var idx = str.indexOf(PATTERNS_2[i]);
				if (idx !== -1) {
					return [OFFSET_2 + i, idx];
				}
			}
			break;
		}
		case 3: {
			for (var i = 0; i < PATTERNS_3.length; i++) {
				var idx = str.indexOf(PATTERNS_3[i]);
				if (idx !== -1) {
					return [OFFSET_3 + i, idx];
				}
			}
			break;
		}
		case 4: {
			for (var i = 0; i < PATTERNS_4.length; i++) {
				var idx = str.indexOf(PATTERNS_4[i]);
				if (idx !== -1) {
					return [OFFSET_4 + i, idx];
				}
			}
			break;
		}
		case 5: {
			var idx = str.indexOf('+++++');
			if (idx !== -1) {
				return [OFFSET_5, idx]
			}
			break;
		}
		case 6: {
			return [OFFSET_6, 0];
		}
		default: {

			console.log("found degenerate number of links: " + count);
			return [-1, -1];
		}
	}
	return [-1, -1];
}


class Hex {
	hexID: number;
	cwOffset: number;
	imageType: number;
	linkIdx: number[];
	linkValues: boolean[];
	currentRotation: EaseScalar;	

	offsetRot(): number { return -this.cwOffset / 3.0 * Math.PI; }

	constructor(id: number, linkIdx: number[], linkVals: boolean[]) {
		this.hexID = id;
		this.linkIdx = linkIdx;
		this.linkValues = linkVals;
		var patternInfo = matchPattern(linkVals);
		// console.log(patternInfo);
		this.imageType = patternInfo[0];
		this.cwOffset = patternInfo[1];
		let r = this.offsetRot();
		this.currentRotation = new EaseScalar(r, r, 0.0, 0.0);
	}

	relevantLinks(): IdxLink[] {
		var links: IdxLink[] = [];
		for (var i = 0; i < this.linkIdx.length; i++) {
			if (this.linkIdx[i] !== -1) links.push([this.linkIdx[i], this.linkValues[i]]);
		}
		return links;
	}

	initRotation() { let r = this.offsetRot(); this.currentRotation = new EaseScalar(r, r, 0.0, 0.0); }

	
	startAnimateCW(currentTime: number) {
		let r = this.offsetRot();
		this.currentRotation = new EaseScalar(r, r - Math.PI / 3.0, currentTime, currentTime + TURN_DURATION);
	}

	startAnimateCCW(currentTime: number) {
		let r = this.offsetRot();
		this.currentRotation = new EaseScalar(r, r + Math.PI / 3.0, currentTime, currentTime + TURN_DURATION);
	}

	rotateCW(): IdxLink[] {
		var old5 = this.linkValues[5];
		for (var i = 5; i > 0; i--) {
			this.linkValues[i] = this.linkValues[i - 1];
		}
		this.linkValues[0] = old5;

		this.cwOffset = this.cwOffset + 1;
		if (this.cwOffset >= HEX_SIZE) this.cwOffset -= HEX_SIZE;

		return this.relevantLinks();
	}

	rotateCCW(): IdxLink[] {
		var old0 = this.linkValues[0];
		for (var i = 0; i < 5; i++) {
			this.linkValues[i] = this.linkValues[i + 1];
		}
		this.linkValues[5] = old0;

		this.cwOffset = this.cwOffset - 1;
		if (this.cwOffset < 0) this.cwOffset += HEX_SIZE;

		return this.relevantLinks();

	}

	getImageType() : number { return this.imageType; }
	getOffset() : number { return this.cwOffset; }
	getRotation(currentTime: number) : number { return this.currentRotation.getSmooth(currentTime); }
}

const linkToHex: number[][] = [[0, 5], [0, 6], [0, 1], [1, 6], [1, 2], [2, 6], [2, 3], [3, 6], [3, 4], [4, 6], [4, 5], [5, 6]];
		

class HackingPuzzle {

	// 7 hexes in puzzle, hex[6] is in the center
	hexes: Hex[];
	translations: mat4[];
	// there are 12 possible connection points for the puzzle between hexes
	// links are pairs between hexes, and multiple solutions can be possible
	linkStatus: boolean[][];
	// index of hex highlighted by mouse
	selected: number;


	constructor() {	
		this.generatePuzzle();
		this.selected = -1;
		this.translations = [];

		let radius = 1.9;
		for (var i = 0; i < 6; i++) {
			var theta = -i * 60.0 / 180.0 * Math.PI;
			var px = Math.cos(theta) * radius;
			var py = Math.sin(theta) * radius;
			var pz = 0;
			var mi = mat4.create();
			mat4.fromTranslation(mi, vec3.fromValues(px, py, pz));
			this.translations.push(mi);
		}
		var m7 = mat4.create();
		mat4.identity(m7);

		this.translations.push(m7);
	}

	// world space matrices for each hex
	drawMatrices(currentTime: number): mat4[] {
		var transforms: mat4[] = [];

		for (var i = 0; i < 7; i++) {
			var rotation = mat4.create();
			//rotation = mat4.fromZRotation(rotation, -this.hexes[i].cwOffset * 60.0 / 180.0 * Math.PI);
			rotation = mat4.fromZRotation(rotation, this.hexes[i].getRotation(currentTime));
			mat4.multiply(rotation, this.translations[i], rotation);
			transforms.push(rotation);
		}

		return transforms;
	}

	// determines the sprite on the sheet to draw for each hex
	drawImageTypes(): number[] {
		var types: number[] = [];
		for (var i = 0; i < 7; i++) types.push(this.hexes[i].getImageType());
		return types;
	}

	updateLinks(udl: IdxLink[], hexIdx: number) {
		for (var i = 0; i < udl.length; i++) {
			var idx: number = udl[i][0];
			var val: boolean = udl[i][1];
			if (linkToHex[idx][0] === hexIdx) {
				this.linkStatus[idx][0] = val;
			} else {
				this.linkStatus[idx][1] = val;
			}
		}
	}

	generatePuzzle() {
		this.hexes = [];
		var links = [];
		this.linkStatus = [];

		// randomly generate the links
		for (var i = 0; i < NUM_LINKS; i++) {
			links.push(Math.random() < 0.5);
		}

		// pre-process: ensure that every hex has at least one link
		let preIdx: number[][] = [];
		let baseIDX = 0;
		for (let i = 0; i < NUM_HEX - 1; i++) {
			preIdx.push([]);
			preIdx[i].push(baseIDX);
			preIdx[i].push(++baseIDX);
			preIdx[i].push(++baseIDX % NUM_LINKS);
		}

		// center hex is special case
		preIdx.push([]);
		for (let i = 0; i < NUM_HEX; i++) preIdx[6].push(1 + 2 * i);

		console.log(preIdx);
		for (let i = 0; i < preIdx.length; i++) {
			var anyCorrect = false;
			for (var j = 0; j < preIdx[0].length; j++) {
				anyCorrect = anyCorrect || links[preIdx[i][j]];
			}
			if (!anyCorrect) {
				// randomly toggle a link in this hex on
				var pick = Math.floor(Math.random() * preIdx[i].length);
				links[preIdx[i][pick]] = true;
			}
		}


		// pre-process: ensure single connected component. if can't reach hex, connect it to center
		var seen: boolean[] = [false, false, false, false, false, false, false];
		var dfsStack: number[] = [6];
		while(dfsStack.length > 0) {
			var current = dfsStack.pop();
			if (!seen[current]) {
				seen[current] = true;

				for (let x = 0; x < preIdx[current].length; x++) {
					var idx = preIdx[current][x];

					if (links[idx]) {
						var link = linkToHex[idx];
						var next = (link[0] != current) ? link[0] : link[1];
						console.log("pushed " + next + " from " + current);
						dfsStack.push(next);
					}
				}
			}			
		}

		for (let i = 0; i < 6; i++) {
			if (!seen[i]) {
				//console.log("not seen: " + i);
				links[preIdx[i][1]] = true;
			}
		}

		// create baseline link status
		for (var i = 0; i < links.length; i++) {
			var l = links[i]
			this.linkStatus.push([l, l]);
		}

		// create each hex from the links
		var firstIdx = 2;
		baseIDX = 2
		
		for (var i = 0; i < NUM_HEX - 1; i++) {
			// link index for each hex, -1 means on outside (no link)
			var hexIdx = [-1, -1, -1, -1, -1, -1];
			hexIdx[firstIdx % HEX_SIZE] = baseIDX % NUM_LINKS;
			hexIdx[(firstIdx + 1) % HEX_SIZE] = baseIDX - 1;
			hexIdx[(firstIdx + 2) % HEX_SIZE] = baseIDX - 2;
			firstIdx += 1;
			baseIDX = (baseIDX + 2);
			//console.log(hexIdx);
			// get the correct booleans for each link

			var idxVals: boolean[] = [];
			for (var j = 0; j < HEX_SIZE; j++) {
				if (hexIdx[j] === -1){
					idxVals.push(false);
				} 
				else {
					idxVals.push(links[hexIdx[j]]);
				} 
			}

			// create the hex
			this.hexes.push(new Hex(i, hexIdx, idxVals));
			// shuffle
			var numTwist = Math.floor(Math.random() * HEX_SIZE);
			for (var j = 0; j < numTwist; j++) this.updateLinks(this.hexes[i].rotateCW(), i);
			this.hexes[i].initRotation();
		}

		// final hex:
		var hexIdx = [1, 3, 5, 7, 9, 11];
		var idxVals: boolean[] = [];
		for (var j = 0; j < HEX_SIZE; j++) {
			idxVals.push(links[hexIdx[j]]);		
		}
		this.hexes.push(new Hex(6, hexIdx, idxVals));
		var numTwist = Math.floor(Math.random() * HEX_SIZE);
		for (var j = 0; j < numTwist; j++) this.updateLinks(this.hexes[6].rotateCW(), 6);
		this.hexes[6].initRotation();
		console.log("generated");
	}

	verify(): boolean {
		var correct = true;
		for (var i = 0; i < this.linkStatus.length; i++) {
			correct = correct && (this.linkStatus[i][0] == this.linkStatus[i][1]);
		}
		return correct;
	}


	// ray plane intersect and try to find closest hex
	// currently assumed puzzle is on xy plane through origin
	highlight(ro: vec3, rd: vec3) {
		var n = vec3.fromValues(0, 0, 1);
		if (vec3.dot(ro, n) < 0.0001) {
			this.selected = -1;
		} else {
			var r0 = vec3.create();
			vec3.sub(r0, vec3.fromValues(0, 0, 0), ro);
			var t = vec3.dot(r0, n) / vec3.dot(rd, n);
			vec3.scale(rd, rd, t);
			var res = vec3.create();
			vec3.add(res, ro, rd);
			
			var bestDist = Number.MAX_VALUE;
			var bestIdx = -1;

			for (var i = 0; i < this.translations.length; i++) {
				var tra = vec3.create();
				mat4.getTranslation(tra, this.translations[i]);
				var dx = res[0] - tra[0];
				var dy = res[1] - tra[1];
				var dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < bestDist) {
					bestIdx = i;
					bestDist = dist;
				}
			}

			if (bestDist > 1.0) bestIdx = -1;
			this.selected = bestIdx;
			console.log(this.selected);

		}

	}

	leftClick(currentTime: number) {
		if (this.selected === -1) return;
		this.hexes[this.selected].startAnimateCW(currentTime);
		this.updateLinks(this.hexes[this.selected].rotateCW(), this.selected);
	}

	rightClick(currentTime: number) {
		if (this.selected === -1) return;
		this.hexes[this.selected].startAnimateCCW(currentTime);
		this.updateLinks(this.hexes[this.selected].rotateCCW(), this.selected);
	}

}

export default HackingPuzzle;