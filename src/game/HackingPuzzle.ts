
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
	linkTruth: boolean[];

	constructor(id: number, linkIdx: number[], linkVals: boolean[], linkTruth: boolean[]) {
		this.hexID = id;
		this.linkIdx = linkIdx;
		this.linkValues = linkVals;
		this.linkTruth = linkTruth;
		var patternInfo = matchPattern(linkTruth);
		console.log(patternInfo);
		this.imageType = patternInfo[0];
		this.cwOffset = patternInfo[1];
	}

	rotateCW() {

		var old5 = this.linkValues[5];
		for (var i = 5; i > 0; i--) {
			this.linkValues[i] = this.linkValues[i - 1];
		}
		this.linkValues[0] = old5;

		this.cwOffset = this.cwOffset + 1;
		if (this.cwOffset >= HEX_SIZE) this.cwOffset -= HEX_SIZE;

		//console.log(this.linkValues);
	}

	rotateCCW() {
		var old0 = this.linkValues[0];
		for (var i = 0; i < 5; i++) {
			this.linkValues[i] = this.linkValues[i + 1];
		}
		this.linkValues[5] = old0;

		this.cwOffset = this.cwOffset - 1;
		if (this.cwOffset < 0) this.cwOffset += HEX_SIZE;
	}

	verify() : boolean {
		var correct = true;
		for (var i = 0; i < this.linkValues.length; i++) correct = correct && (this.linkValues[i] == this.linkTruth[i]);
		return correct;
	}

	getImageType() : number { return this.imageType; }
	getOffset() : number { return this.cwOffset; }
}

class HackingPuzzle {
	// there are 12 possible connection points for the puzzle between hexes
	links: boolean[];
	// 7 hexes in puzzle, hex[6] is in the center
	hexes: Hex[];

	constructor() {		
		this.generatePuzzle();
	}

	generatePuzzle() {
		this.hexes = [];
		this.links = [];
		// randomly generate the links
		for (var i = 0; i < NUM_LINKS; i++) {
			this.links.push(Math.random() < 0.5);
		}

		// pre-process: ensure that every hex has at least one link
		var preIdx: number[][] = [];
		var baseIDX = 0;
		for (var i = 0; i < NUM_HEX - 1; i++) {
			preIdx.push([]);
			preIdx[i].push(baseIDX);
			preIdx[i].push(++baseIDX);
			preIdx[i].push(++baseIDX % NUM_LINKS);
		}
		// center hex is special case
		preIdx.push([]);
		for (var i = 0; i < NUM_HEX; i++) preIdx[6].push(1 + 2 * i);

		console.log(preIdx);
		for (var i = 0; i < preIdx.length; i++) {
			var anyCorrect = false;
			for (var j = 0; j < preIdx[0].length; j++) {
				anyCorrect = anyCorrect || this.links[preIdx[i][j]];
			}
			if (!anyCorrect) {
				// randomly toggle a link in this hex on
				var pick = Math.floor(Math.random() * preIdx[i].length);
				this.links[preIdx[i][pick]] = true;
			}
			console.log(i);
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
			// initial values are the same
			var idxTruth: boolean[] = [];
			var idxVals: boolean[] = [];
			for (var j = 0; j < HEX_SIZE; j++) {
				if (hexIdx[j] === -1){
					idxTruth.push(false);
					idxVals.push(false);
				} 
				else {
					idxTruth.push(this.links[hexIdx[j]]);
					idxVals.push(this.links[hexIdx[j]]);
				} 
			}

			// create the hex
			this.hexes.push(new Hex(i, hexIdx, idxVals, idxTruth));
			// shuffle
			var numTwist = Math.floor(Math.random() * HEX_SIZE);
			for (var j = 0; j < numTwist; j++) this.hexes[i].rotateCW();
		}

		// final hex:
		var hexIdx = [1, 3, 5, 7, 9, 11];
		var idxTruth: boolean[] = [];
		var idxVals: boolean[] = [];
		for (var j = 0; j < HEX_SIZE; j++) {
			idxTruth.push(this.links[hexIdx[j]]);
			idxVals.push(this.links[hexIdx[j]]);		
		}
		this.hexes.push(new Hex(6, hexIdx, idxVals, idxTruth));
		var numTwist = Math.floor(Math.random() * HEX_SIZE);
		for (var j = 0; j < numTwist; j++) this.hexes[i].rotateCW();

		console.log("generated");
		console.log(this.hexes[0].verify());
	}

	verify() {
		var correct = true;
		for (let hex of this.hexes) correct = correct && hex.verify();
		return correct;
	}

}

export default HackingPuzzle;