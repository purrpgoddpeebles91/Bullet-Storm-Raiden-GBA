/*
 gbajs by Jeffrey Pfau (endrift), BSD 2-clause license:
Copyright (c) 2012, Jeffrey Pfau
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

 Bullet Storm Raiden (c) 2026 Zachary Peebles. Original homebrew.
*/
Object.prototype.inherit = function() {
	for (var v in this) {
		this[v] = this[v];
	}
};

function hex(number, leading, usePrefix) {
	if (typeof(usePrefix) === 'undefined') {
		usePrefix = true;
	}
	if (typeof(leading) === 'undefined') {
		leading = 8;
	}
	var string = (number >>> 0).toString(16).toUpperCase();
	leading -= string.length;
	if (leading < 0)
		return string;
	return (usePrefix ? '0x' : '') + new Array(leading + 1).join('0') + string;
}

Serializer = {
	TAG_INT: 1,
	TAG_STRING: 2,
	TAG_STRUCT: 3,
	TAG_BLOB: 4,
	TAG_BOOLEAN: 5,
	TYPE: 'application/octet-stream',

	pointer: function() {
		this.index = 0;
		this.top = 0;
		this.stack = [];
	},

	pack: function(value) {
		var object = new DataView(new ArrayBuffer(4));
		object.setUint32(0, value, true);
		return object.buffer;
	},

	pack8: function(value) {
		var object = new DataView(new ArrayBuffer(1));
		object.setUint8(0, value, true);
		return object.buffer;
	},

	prefix: function(value) {
		return new Blob([Serializer.pack(value.size || value.length || value.byteLength), value], { type: Serializer.TYPE });
	},

	serialize: function(stream) {
		var parts = [];
		var size = 4;
		for (i in stream) {
			if (stream.hasOwnProperty(i)) {
				var tag;
				var head = Serializer.prefix(i);
				var body;
				switch (typeof(stream[i])) {
				case 'number':
					tag = Serializer.TAG_INT;
					body = Serializer.pack(stream[i]);
					break;
				case 'string':
					tag = Serializer.TAG_STRING;
					body = Serializer.prefix(stream[i]);
					break;
				case 'object':
					if (stream[i].type == Serializer.TYPE) {
						tag = Serializer.TAG_BLOB;
						body = stream[i];
					} else {
						tag = Serializer.TAG_STRUCT;
						body = Serializer.serialize(stream[i]);
					}
					break;
				case 'boolean':
					tag = Serializer.TAG_BOOLEAN;
					body = Serializer.pack8(stream[i]);
					break;
				default:
					console.log(stream[i]);
					break;
				}
				size += 1 + head.size + (body.size || body.byteLength || body.length);
				parts.push(Serializer.pack8(tag));
				parts.push(head);
				parts.push(body);
			}
		}
		parts.unshift(Serializer.pack(size));
		return new Blob(parts);
	},

	deserialize: function(blob, callback) {
		var reader = new FileReader();
		reader.onload = function(data) {
			callback(Serializer.deserealizeStream(new DataView(data.target.result), new Serializer.pointer));
		}
		reader.readAsArrayBuffer(blob);
	},

	deserealizeStream: function(view, pointer) {
		pointer.push();
		var object = {};
		var remaining = view.getUint32(pointer.advance(4), true);
		while (pointer.mark() < remaining) {
			var tag = view.getUint8(pointer.advance(1));
			var head = pointer.readString(view);
			var body;
			switch (tag) {
			case Serializer.TAG_INT:
				body = view.getUint32(pointer.advance(4), true);
				break;
			case Serializer.TAG_STRING:
				body = pointer.readString(view);
				break;
			case Serializer.TAG_STRUCT:
				body = Serializer.deserealizeStream(view, pointer);
				break;
			case Serializer.TAG_BLOB:
				var size = view.getUint32(pointer.advance(4), true);
				body = view.buffer.slice(pointer.advance(size), pointer.advance(0));
				break;
			case Serializer.TAG_BOOLEAN:
				body = !!view.getUint8(pointer.advance(1));
				break;
			}
			object[head] = body;
		}
		if (pointer.mark() > remaining) {
			throw "Size of serialized data exceeded";
		}
		pointer.pop();
		return object;
	},

	serializePNG: function(blob, base, callback) {
		var canvas = document.createElement('canvas');
		var context = canvas.getContext('2d');
		var pixels = base.getContext('2d').getImageData(0, 0, base.width, base.height);
		var transparent = 0;
		for (var y = 0; y < base.height; ++y) {
			for (var x = 0; x < base.width; ++x) {
				if (!pixels.data[(x + y * base.width) * 4 + 3]) {
					++transparent;
				}
			}
		}
		var bytesInCanvas = transparent * 3 + (base.width * base.height - transparent);
		for (var multiplier = 1; (bytesInCanvas * multiplier * multiplier) < blob.size; ++multiplier);
		var edges = bytesInCanvas * multiplier * multiplier - blob.size;
		var padding = Math.ceil(edges / (base.width * multiplier));
		canvas.setAttribute('width', base.width * multiplier);
		canvas.setAttribute('height', base.height * multiplier + padding);

		var reader = new FileReader();
		reader.onload = function(data) {
			var view = new Uint8Array(data.target.result);
			var pointer = 0;
			var pixelPointer = 0;
			var newPixels = context.createImageData(canvas.width, canvas.height + padding);
			for (var y = 0; y < canvas.height; ++y) {
				for (var x = 0; x < canvas.width; ++x) {
					var oldY = (y / multiplier) | 0;
					var oldX = (x / multiplier) | 0;
					if (oldY > base.height || !pixels.data[(oldX + oldY * base.width) * 4 + 3]) {
						newPixels.data[pixelPointer++] = view[pointer++];
						newPixels.data[pixelPointer++] = view[pointer++];
						newPixels.data[pixelPointer++] = view[pointer++];
						newPixels.data[pixelPointer++] = 0;
					} else {
						var byte = view[pointer++];
						newPixels.data[pixelPointer++] = pixels.data[(oldX + oldY * base.width) * 4 + 0] | (byte & 7);
						newPixels.data[pixelPointer++] = pixels.data[(oldX + oldY * base.width) * 4 + 1] | ((byte >> 3) & 7);
						newPixels.data[pixelPointer++] = pixels.data[(oldX + oldY * base.width) * 4 + 2] | ((byte >> 6) & 7);
						newPixels.data[pixelPointer++] = pixels.data[(oldX + oldY * base.width) * 4 + 3];
					}
				}
			}
			context.putImageData(newPixels, 0, 0);
			callback(canvas.toDataURL('image/png'));
		}
		reader.readAsArrayBuffer(blob);
		return canvas;
	},

	deserializePNG: function(blob, callback) {
		var reader = new FileReader();
		reader.onload = function(data) {
			var image = document.createElement('img');
			image.setAttribute('src', data.target.result);
			var canvas = document.createElement('canvas');
			canvas.setAttribute('height', image.height);
			canvas.setAttribute('width', image.width);
			var context = canvas.getContext('2d');
			context.drawImage(image, 0, 0);
			var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
			var data = [];
			for (var y = 0; y < canvas.height; ++y) {
				for (var x = 0; x < canvas.width; ++x) {
					if (!pixels.data[(x + y * canvas.width) * 4 + 3]) {
						data.push(pixels.data[(x + y * canvas.width) * 4 + 0]);
						data.push(pixels.data[(x + y * canvas.width) * 4 + 1]);
						data.push(pixels.data[(x + y * canvas.width) * 4 + 2]);
					} else {
						var byte = 0;
						byte |= pixels.data[(x + y * canvas.width) * 4 + 0] & 7;
						byte |= (pixels.data[(x + y * canvas.width) * 4 + 1] & 7) << 3;
						byte |= (pixels.data[(x + y * canvas.width) * 4 + 2] & 7) << 6;
						data.push(byte);
					}
				}
			}
			newBlob = new Blob(data.map(function (byte) {
				var array = new Uint8Array(1);
				array[0] = byte;
				return array;
			}), { type: Serializer.TYPE});
			Serializer.deserialize(newBlob, callback);
		}
		reader.readAsDataURL(blob);
	}
};

Serializer.pointer.prototype.advance = function(amount) {
	var index = this.index;
	this.index += amount;
	return index;
};

Serializer.pointer.prototype.mark = function() {
	return this.index - this.top;
};

Serializer.pointer.prototype.push = function() {
	this.stack.push(this.top);
	this.top = this.index;
};

Serializer.pointer.prototype.pop = function() {
	this.top = this.stack.pop();
};

Serializer.pointer.prototype.readString = function(view) {
	var length = view.getUint32(this.advance(4), true);
	var bytes = [];
	for (var i = 0; i < length; ++i) {
		bytes.push(String.fromCharCode(view.getUint8(this.advance(1))));
	}
	return bytes.join('');
};

function ARMCore() {
	this.inherit();
	this.SP = 13;
	this.LR = 14;
	this.PC = 15;

	this.MODE_ARM = 0;
	this.MODE_THUMB = 1;

	this.MODE_USER = 0x10;
	this.MODE_FIQ = 0x11;
	this.MODE_IRQ = 0x12;
	this.MODE_SUPERVISOR = 0x13;
	this.MODE_ABORT = 0x17;
	this.MODE_UNDEFINED = 0x1B;
	this.MODE_SYSTEM = 0x1F;

	this.BANK_NONE = 0
	this.BANK_FIQ = 1;
	this.BANK_IRQ = 2;
	this.BANK_SUPERVISOR = 3;
	this.BANK_ABORT = 4;
	this.BANK_UNDEFINED = 5;

	this.UNALLOC_MASK = 0x0FFFFF00;
	this.USER_MASK = 0xF0000000;
	this.PRIV_MASK = 0x000000CF; // This is out of spec, but it seems to be what's done in other implementations
	this.STATE_MASK = 0x00000020;

	this.WORD_SIZE_ARM = 4;
	this.WORD_SIZE_THUMB = 2;

	this.BASE_RESET = 0x00000000;
	this.BASE_UNDEF = 0x00000004;
	this.BASE_SWI = 0x00000008;
	this.BASE_PABT = 0x0000000C;
	this.BASE_DABT = 0x00000010;
	this.BASE_IRQ = 0x00000018;
	this.BASE_FIQ = 0x0000001C;

	this.armCompiler = new ARMCoreArm(this);
	this.thumbCompiler = new ARMCoreThumb(this);
	this.generateConds();

	this.gprs = new Int32Array(16);
};

ARMCore.prototype.resetCPU = function(startOffset) {
	for (var i = 0; i < this.PC; ++i) {
		this.gprs[i] = 0;
	}
	this.gprs[this.PC] = startOffset + this.WORD_SIZE_ARM;

	this.loadInstruction = this.loadInstructionArm;
	this.execMode = this.MODE_ARM;
	this.instructionWidth = this.WORD_SIZE_ARM;

	this.mode = this.MODE_SYSTEM;

	this.cpsrI = false;
	this.cpsrF = false;

	this.cpsrV = false;
	this.cpsrC = false;
	this.cpsrZ = false;
	this.cpsrN = false;

	this.bankedRegisters = [
		new Int32Array(7),
		new Int32Array(7),
		new Int32Array(2),
		new Int32Array(2),
		new Int32Array(2),
		new Int32Array(2)
	];
	this.spsr = 0;
	this.bankedSPSRs = new Int32Array(6);

	this.cycles = 0;

	this.shifterOperand = 0;
	this.shifterCarryOut = 0;

	this.page = null;
	this.pageId = 0;
	this.pageRegion = -1;

	this.instruction = null;

	this.irq.clear();

	var gprs = this.gprs;
	var mmu = this.mmu;
	this.step = function() {
		var instruction = this.instruction || (this.instruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth));
		gprs[this.PC] += this.instructionWidth;
		this.conditionPassed = true;
		instruction();

		if (!instruction.writesPC) {
			if (this.instruction != null) { // We might have gotten an interrupt from the instruction
				if (instruction.next == null || instruction.next.page.invalid) {
					instruction.next = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
				}
				this.instruction = instruction.next;
			}
		} else {
			if (this.conditionPassed) {
				var pc = gprs[this.PC] &= 0xFFFFFFFE;
				if (this.execMode == this.MODE_ARM) {
					mmu.wait32(pc);
					mmu.waitPrefetch32(pc);
				} else {
					mmu.wait(pc);
					mmu.waitPrefetch(pc);
				}
				gprs[this.PC] += this.instructionWidth;
				if (!instruction.fixedJump) {
					this.instruction = null;
				} else if  (this.instruction != null) {
					if (instruction.next == null || instruction.next.page.invalid) {
						instruction.next = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
					}
					this.instruction = instruction.next;
				}
			} else {
				this.instruction = null;
			}
		}
		this.irq.updateTimers();
	};
};

ARMCore.prototype.freeze = function() {
	return {
		'gprs': [
			this.gprs[0],
			this.gprs[1],
			this.gprs[2],
			this.gprs[3],
			this.gprs[4],
			this.gprs[5],
			this.gprs[6],
			this.gprs[7],
			this.gprs[8],
			this.gprs[9],
			this.gprs[10],
			this.gprs[11],
			this.gprs[12],
			this.gprs[13],
			this.gprs[14],
			this.gprs[15],
		],
		'mode': this.mode,
		'cpsrI': this.cpsrI,
		'cpsrF': this.cpsrF,
		'cpsrV': this.cpsrV,
		'cpsrC': this.cpsrC,
		'cpsrZ': this.cpsrZ,
		'cpsrN': this.cpsrN,
		'bankedRegisters': [
			[
				this.bankedRegisters[0][0],
				this.bankedRegisters[0][1],
				this.bankedRegisters[0][2],
				this.bankedRegisters[0][3],
				this.bankedRegisters[0][4],
				this.bankedRegisters[0][5],
				this.bankedRegisters[0][6]
			],
			[
				this.bankedRegisters[1][0],
				this.bankedRegisters[1][1],
				this.bankedRegisters[1][2],
				this.bankedRegisters[1][3],
				this.bankedRegisters[1][4],
				this.bankedRegisters[1][5],
				this.bankedRegisters[1][6]
			],
			[
				this.bankedRegisters[2][0],
				this.bankedRegisters[2][1]
			],
			[
				this.bankedRegisters[3][0],
				this.bankedRegisters[3][1]
			],
			[
				this.bankedRegisters[4][0],
				this.bankedRegisters[4][1]
			],
			[
				this.bankedRegisters[5][0],
				this.bankedRegisters[5][1]
			]
		],
		'spsr': this.spsr,
		'bankedSPSRs': [
			this.bankedSPSRs[0],
			this.bankedSPSRs[1],
			this.bankedSPSRs[2],
			this.bankedSPSRs[3],
			this.bankedSPSRs[4],
			this.bankedSPSRs[5]
		],
		'cycles': this.cycles
	};
};

ARMCore.prototype.defrost = function(frost) {
	this.instruction = null;

	this.page = null;
	this.pageId = 0;
	this.pageRegion = -1;

	this.gprs[0] = frost.gprs[0];
	this.gprs[1] = frost.gprs[1];
	this.gprs[2] = frost.gprs[2];
	this.gprs[3] = frost.gprs[3];
	this.gprs[4] = frost.gprs[4];
	this.gprs[5] = frost.gprs[5];
	this.gprs[6] = frost.gprs[6];
	this.gprs[7] = frost.gprs[7];
	this.gprs[8] = frost.gprs[8];
	this.gprs[9] = frost.gprs[9];
	this.gprs[10] = frost.gprs[10];
	this.gprs[11] = frost.gprs[11];
	this.gprs[12] = frost.gprs[12];
	this.gprs[13] = frost.gprs[13];
	this.gprs[14] = frost.gprs[14];
	this.gprs[15] = frost.gprs[15];

	this.mode = frost.mode;
	this.cpsrI = frost.cpsrI;
	this.cpsrF = frost.cpsrF;
	this.cpsrV = frost.cpsrV;
	this.cpsrC = frost.cpsrC;
	this.cpsrZ = frost.cpsrZ;
	this.cpsrN = frost.cpsrN;

	this.bankedRegisters[0][0] = frost.bankedRegisters[0][0];
	this.bankedRegisters[0][1] = frost.bankedRegisters[0][1];
	this.bankedRegisters[0][2] = frost.bankedRegisters[0][2];
	this.bankedRegisters[0][3] = frost.bankedRegisters[0][3];
	this.bankedRegisters[0][4] = frost.bankedRegisters[0][4];
	this.bankedRegisters[0][5] = frost.bankedRegisters[0][5];
	this.bankedRegisters[0][6] = frost.bankedRegisters[0][6];

	this.bankedRegisters[1][0] = frost.bankedRegisters[1][0];
	this.bankedRegisters[1][1] = frost.bankedRegisters[1][1];
	this.bankedRegisters[1][2] = frost.bankedRegisters[1][2];
	this.bankedRegisters[1][3] = frost.bankedRegisters[1][3];
	this.bankedRegisters[1][4] = frost.bankedRegisters[1][4];
	this.bankedRegisters[1][5] = frost.bankedRegisters[1][5];
	this.bankedRegisters[1][6] = frost.bankedRegisters[1][6];

	this.bankedRegisters[2][0] = frost.bankedRegisters[2][0];
	this.bankedRegisters[2][1] = frost.bankedRegisters[2][1];

	this.bankedRegisters[3][0] = frost.bankedRegisters[3][0];
	this.bankedRegisters[3][1] = frost.bankedRegisters[3][1];

	this.bankedRegisters[4][0] = frost.bankedRegisters[4][0];
	this.bankedRegisters[4][1] = frost.bankedRegisters[4][1];

	this.bankedRegisters[5][0] = frost.bankedRegisters[5][0];
	this.bankedRegisters[5][1] = frost.bankedRegisters[5][1];

	this.spsr = frost.spsr;
	this.bankedSPSRs[0] = frost.bankedSPSRs[0];
	this.bankedSPSRs[1] = frost.bankedSPSRs[1];
	this.bankedSPSRs[2] = frost.bankedSPSRs[2];
	this.bankedSPSRs[3] = frost.bankedSPSRs[3];
	this.bankedSPSRs[4] = frost.bankedSPSRs[4];
	this.bankedSPSRs[5] = frost.bankedSPSRs[5];

	this.cycles = frost.cycles;
};

ARMCore.prototype.fetchPage = function(address) {
	var region = address >> this.mmu.BASE_OFFSET;
	var pageId = this.mmu.addressToPage(region, address & this.mmu.OFFSET_MASK);
	if (region == this.pageRegion) {
		if (pageId == this.pageId && !this.page.invalid) {
			return;
		}
		this.pageId = pageId;
	} else {
		this.pageMask = this.mmu.memory[region].PAGE_MASK;
		this.pageRegion = region;
		this.pageId = pageId;
	}

	this.page = this.mmu.accessPage(region, pageId);
};

ARMCore.prototype.loadInstructionArm = function(address) {
	var next = null;
	this.fetchPage(address);
	var offset = (address & this.pageMask) >> 2;
	next = this.page.arm[offset];
	if (next) {
		return next;
	}
	var instruction = this.mmu.load32(address) >>> 0;
	next = this.compileArm(instruction);
	next.next = null;
	next.page = this.page;
	next.address = address;
	next.opcode = instruction;
	this.page.arm[offset] = next;
	return next;
};

ARMCore.prototype.loadInstructionThumb = function(address) {
	var next = null;
	this.fetchPage(address);
	var offset = (address & this.pageMask) >> 1;
	next = this.page.thumb[offset];
	if (next) {
		return next;
	}
	var instruction = this.mmu.load16(address);
	next = this.compileThumb(instruction);
	next.next = null;
	next.page = this.page;
	next.address = address;
	next.opcode = instruction;
	this.page.thumb[offset] = next;
	return next;
};

ARMCore.prototype.selectBank = function(mode) {
	switch (mode) {
	case this.MODE_USER:
	case this.MODE_SYSTEM:
		// No banked registers
		return this.BANK_NONE;
	case this.MODE_FIQ:
		return this.BANK_FIQ;
	case this.MODE_IRQ:
		return this.BANK_IRQ;
	case this.MODE_SUPERVISOR:
		return this.BANK_SUPERVISOR;
	case this.MODE_ABORT:
		return this.BANK_ABORT;
	case this.MODE_UNDEFINED:
		return this.BANK_UNDEFINED;
	default:
		throw "Invalid user mode passed to selectBank";
	}
};

ARMCore.prototype.switchExecMode = function(newMode) {
	if (this.execMode != newMode) {
		this.execMode = newMode;
		if (newMode == this.MODE_ARM) {
			this.instructionWidth = this.WORD_SIZE_ARM;
			this.loadInstruction = this.loadInstructionArm;
		} else {
			this.instructionWidth = this.WORD_SIZE_THUMB;
			this.loadInstruction = this.loadInstructionThumb;
		}
	}
	
};

ARMCore.prototype.switchMode = function(newMode) {
	if (newMode == this.mode) {
		// Not switching modes after all
		return;
	}
	if (newMode != this.MODE_USER || newMode != this.MODE_SYSTEM) {
		// Switch banked registers
		var newBank = this.selectBank(newMode);
		var oldBank = this.selectBank(this.mode);
		if (newBank != oldBank) {
			// TODO: support FIQ
			if (newMode == this.MODE_FIQ || this.mode == this.MODE_FIQ) {
				var oldFiqBank = (oldBank == this.BANK_FIQ) + 0;
				var newFiqBank = (newBank == this.BANK_FIQ) + 0;
				this.bankedRegisters[oldFiqBank][2] = this.gprs[8];
				this.bankedRegisters[oldFiqBank][3] = this.gprs[9];
				this.bankedRegisters[oldFiqBank][4] = this.gprs[10];
				this.bankedRegisters[oldFiqBank][5] = this.gprs[11];
				this.bankedRegisters[oldFiqBank][6] = this.gprs[12];
				this.gprs[8] = this.bankedRegisters[newFiqBank][2];
				this.gprs[9] = this.bankedRegisters[newFiqBank][3];
				this.gprs[10] = this.bankedRegisters[newFiqBank][4];
				this.gprs[11] = this.bankedRegisters[newFiqBank][5];
				this.gprs[12] = this.bankedRegisters[newFiqBank][6];
			}
			this.bankedRegisters[oldBank][0] = this.gprs[this.SP];
			this.bankedRegisters[oldBank][1] = this.gprs[this.LR];
			this.gprs[this.SP] = this.bankedRegisters[newBank][0];
			this.gprs[this.LR] = this.bankedRegisters[newBank][1];

			this.bankedSPSRs[oldBank] = this.spsr;
			this.spsr = this.bankedSPSRs[newBank];
		}
	}
	this.mode = newMode;
};

ARMCore.prototype.packCPSR = function() {
	return this.mode | (!!this.execMode << 5) | (!!this.cpsrF << 6) | (!!this.cpsrI << 7) |
	       (!!this.cpsrN << 31) | (!!this.cpsrZ << 30) | (!!this.cpsrC << 29) | (!!this.cpsrV << 28);
};

ARMCore.prototype.unpackCPSR = function(spsr) {
	this.switchMode(spsr & 0x0000001F);
	this.switchExecMode(!!(spsr & 0x00000020));
	this.cpsrF = spsr & 0x00000040;
	this.cpsrI = spsr & 0x00000080;
	this.cpsrN = spsr & 0x80000000;
	this.cpsrZ = spsr & 0x40000000;
	this.cpsrC = spsr & 0x20000000;
	this.cpsrV = spsr & 0x10000000;

	this.irq.testIRQ();
};

ARMCore.prototype.hasSPSR = function() {
	return this.mode != this.MODE_SYSTEM && this.mode != this.MODE_USER;
};

ARMCore.prototype.raiseIRQ = function() {
	if (this.cpsrI) {
		return;
	}
	var cpsr = this.packCPSR();
	var instructionWidth = this.instructionWidth;
	this.switchMode(this.MODE_IRQ);
	this.spsr = cpsr;
	this.gprs[this.LR] = this.gprs[this.PC] - instructionWidth + 4;
	this.gprs[this.PC] = this.BASE_IRQ + this.WORD_SIZE_ARM;
	this.instruction = null;
	this.switchExecMode(this.MODE_ARM);
	this.cpsrI = true;
};

ARMCore.prototype.raiseTrap = function() {
	var cpsr = this.packCPSR();
	var instructionWidth = this.instructionWidth;
	this.switchMode(this.MODE_SUPERVISOR);
	this.spsr = cpsr;
	this.gprs[this.LR] = this.gprs[this.PC] - instructionWidth;
	this.gprs[this.PC] = this.BASE_SWI + this.WORD_SIZE_ARM;
	this.instruction = null;
	this.switchExecMode(this.MODE_ARM);
	this.cpsrI = true;
};

ARMCore.prototype.badOp = function(instruction) {
	var func = function() {
		throw "Illegal instruction: 0x" + instruction.toString(16);
	};
	func.writesPC = true;
	func.fixedJump = false;
	return func;
};

ARMCore.prototype.generateConds = function() {
	var cpu = this;
	this.conds = [
		// EQ
		function() {
			return cpu.conditionPassed = cpu.cpsrZ;
		},
		// NE
		function() {
			return cpu.conditionPassed = !cpu.cpsrZ;
		},
		// CS
		function() {
			return cpu.conditionPassed = cpu.cpsrC;
		},
		// CC
		function() {
			return cpu.conditionPassed = !cpu.cpsrC;
		},
		// MI
		function() {
			return cpu.conditionPassed = cpu.cpsrN;
		},
		// PL
		function() {
			return cpu.conditionPassed = !cpu.cpsrN;
		},
		// VS
		function() {
			return cpu.conditionPassed = cpu.cpsrV;
		},
		// VC
		function() {
			return cpu.conditionPassed = !cpu.cpsrV;
		},
		// HI
		function () {
			return cpu.conditionPassed = cpu.cpsrC && !cpu.cpsrZ;
		},
		// LS
		function () {
			return cpu.conditionPassed = !cpu.cpsrC || cpu.cpsrZ;
		},
		// GE
		function () {
			return cpu.conditionPassed = !cpu.cpsrN == !cpu.cpsrV;
		},
		// LT
		function () {
			return cpu.conditionPassed = !cpu.cpsrN != !cpu.cpsrV;
		},
		// GT
		function () {
			return cpu.conditionPassed = !cpu.cpsrZ && !cpu.cpsrN == !cpu.cpsrV;
		},
		// LE
		function () {
			return cpu.conditionPassed = cpu.cpsrZ || !cpu.cpsrN != !cpu.cpsrV;
		},
		// AL
		null,
		null
	]
}

ARMCore.prototype.barrelShiftImmediate = function(shiftType, immediate, rm) {
	var cpu = this;
	var gprs = this.gprs;
	var shiftOp = this.badOp;
	switch (shiftType) {
	case 0x00000000:
		// LSL
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] << immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (32 - immediate));
			};
		} else {
			// This boils down to no shift
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm];
				cpu.shifterCarryOut = cpu.cpsrC;
			};
		}
		break;
	case 0x00000020:
		// LSR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] >>> immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			shiftOp = function() {
				cpu.shifterOperand = 0;
				cpu.shifterCarryOut = gprs[rm] & 0x80000000;
			};
		}
		break;
	case 0x00000040:
		// ASR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] >> immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			shiftOp = function() {
				cpu.shifterCarryOut = gprs[rm] & 0x80000000;
				if (cpu.shifterCarryOut) {
					cpu.shifterOperand = 0xFFFFFFFF;
				} else {
					cpu.shifterOperand = 0;
				}
			};
		}
		break;
	case 0x00000060:
		// ROR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = (gprs[rm] >>> immediate) | (gprs[rm] << (32 - immediate));
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			// RRX
			shiftOp = function() {
				cpu.shifterOperand = (!!cpu.cpsrC << 31) | (gprs[rm] >>> 1);
				cpu.shifterCarryOut =  gprs[rm] & 0x00000001;
			};
		}
		break;
	}
	return shiftOp;
}

ARMCore.prototype.compileArm = function(instruction) {
	var op = this.badOp(instruction);
	var i = instruction & 0x0E000000;
	var cpu = this;
	var gprs = this.gprs;

	var condOp = this.conds[(instruction & 0xF0000000) >>> 28];
	if ((instruction & 0x0FFFFFF0) == 0x012FFF10) {
		// BX
		var rm = instruction & 0xF;
		op = this.armCompiler.constructBX(rm, condOp);
		op.writesPC = true;
		op.fixedJump = false;
	} else if (!(instruction & 0x0C000000) && (i == 0x02000000 || (instruction & 0x00000090) != 0x00000090)) {
		var opcode = instruction & 0x01E00000;
		var s = instruction & 0x00100000;
		var shiftsRs = false;
		if ((opcode & 0x01800000) == 0x01000000 && !s) {
			var r = instruction & 0x00400000;
			if ((instruction & 0x00B0F000) == 0x0020F000) {
				// MSR
				var rm = instruction & 0x0000000F;
				var immediate = instruction & 0x000000FF;
				var rotateImm = (instruction & 0x00000F00) >> 7;
				immediate = (immediate >>> rotateImm) | (immediate << (32 - rotateImm));
				op = this.armCompiler.constructMSR(rm, r, instruction, immediate, condOp);
				op.writesPC = false;
			} else if ((instruction & 0x00BF0000) == 0x000F0000) {
				// MRS
				var rd = (instruction & 0x0000F000) >> 12;
				op = this.armCompiler.constructMRS(rd, r, condOp);
				op.writesPC = rd == this.PC;
			}
		} else {
			// Data processing/FSR transfer
			var rn = (instruction & 0x000F0000) >> 16;
			var rd = (instruction & 0x0000F000) >> 12;

			// Parse shifter operand
			var shiftType = instruction & 0x00000060;
			var rm = instruction & 0x0000000F;
			var shiftOp = function() {
				throw 'BUG: invalid barrel shifter';
			};
			if (instruction & 0x02000000) {
				var immediate = instruction & 0x000000FF;
				var rotate = (instruction & 0x00000F00) >> 7;
				if (!rotate) {
					shiftOp = this.armCompiler.constructAddressingMode1Immediate(immediate);
				} else {
					shiftOp = this.armCompiler.constructAddressingMode1ImmediateRotate(immediate, rotate);
				}
			} else if (instruction & 0x00000010) {
				var rs = (instruction & 0x00000F00) >> 8;
				shiftsRs = true;
				switch (shiftType) {
				case 0x00000000:
					// LSL
					shiftOp = this.armCompiler.constructAddressingMode1LSL(rs, rm);
					break;
				case 0x00000020:
					// LSR
					shiftOp = this.armCompiler.constructAddressingMode1LSR(rs, rm);
					break;
				case 0x00000040:
					// ASR
					shiftOp = this.armCompiler.constructAddressingMode1ASR(rs, rm);
					break;
				case 0x00000060:
					// ROR
					shiftOp = this.armCompiler.constructAddressingMode1ROR(rs, rm);
					break;
				}
			} else {
				var immediate = (instruction & 0x00000F80) >> 7;
				shiftOp = this.barrelShiftImmediate(shiftType, immediate, rm);
			}

			switch (opcode) {
			case 0x00000000:
				// AND
				if (s) {
					op = this.armCompiler.constructANDS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructAND(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00200000:
				// EOR
				if (s) {
					op = this.armCompiler.constructEORS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructEOR(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00400000:
				// SUB
				if (s) {
					op = this.armCompiler.constructSUBS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructSUB(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00600000:
				// RSB
				if (s) {
					op = this.armCompiler.constructRSBS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructRSB(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00800000:
				// ADD
				if (s) {
					op = this.armCompiler.constructADDS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructADD(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00A00000:
				// ADC
				if (s) {
					op = this.armCompiler.constructADCS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructADC(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00C00000:
				// SBC
				if (s) {
					op = this.armCompiler.constructSBCS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructSBC(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x00E00000:
				// RSC
				if (s) {
					op = this.armCompiler.constructRSCS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructRSC(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x01000000:
				// TST
				op = this.armCompiler.constructTST(rd, rn, shiftOp, condOp);
				break;
			case 0x01200000:
				// TEQ
				op = this.armCompiler.constructTEQ(rd, rn, shiftOp, condOp);
				break;
			case 0x01400000:
				// CMP
				op = this.armCompiler.constructCMP(rd, rn, shiftOp, condOp);
				break;
			case 0x01600000:
				// CMN
				op = this.armCompiler.constructCMN(rd, rn, shiftOp, condOp);
				break;
			case 0x01800000:
				// ORR
				if (s) {
					op = this.armCompiler.constructORRS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructORR(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x01A00000:
				// MOV
				if (s) {
					op = this.armCompiler.constructMOVS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructMOV(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x01C00000:
				// BIC
				if (s) {
					op = this.armCompiler.constructBICS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructBIC(rd, rn, shiftOp, condOp);
				}
				break;
			case 0x01E00000:
				// MVN
				if (s) {
					op = this.armCompiler.constructMVNS(rd, rn, shiftOp, condOp);
				} else {
					op = this.armCompiler.constructMVN(rd, rn, shiftOp, condOp);
				}
				break;
			}
			op.writesPC = rd == this.PC;
		}
	} else if ((instruction & 0x0FB00FF0) == 0x01000090) {
		// Single data swap
		var rm = instruction & 0x0000000F;
		var rd = (instruction >> 12) & 0x0000000F;
		var rn = (instruction >> 16) & 0x0000000F;
		if (instruction & 0x00400000) {
			op = this.armCompiler.constructSWPB(rd, rn, rm, condOp);
		} else {
			op = this.armCompiler.constructSWP(rd, rn, rm, condOp);
		}
		op.writesPC = rd == this.PC;
	} else {
		switch (i) {
		case 0x00000000:
			if ((instruction & 0x010000F0) == 0x00000090) {
				// Multiplies
				var rd = (instruction & 0x000F0000) >> 16;
				var rn = (instruction & 0x0000F000) >> 12;
				var rs = (instruction & 0x00000F00) >> 8;
				var rm = instruction & 0x0000000F;
				switch (instruction & 0x00F00000) {
				case 0x00000000:
					// MUL
					op = this.armCompiler.constructMUL(rd, rs, rm, condOp);
					break;
				case 0x00100000:
					// MULS
					op = this.armCompiler.constructMULS(rd, rs, rm, condOp);
					break;
				case 0x00200000:
					// MLA
					op = this.armCompiler.constructMLA(rd, rn, rs, rm, condOp);
					break
				case 0x00300000:
					// MLAS
					op = this.armCompiler.constructMLAS(rd, rn, rs, rm, condOp);
					break;
				case 0x00800000:
					// UMULL
					op = this.armCompiler.constructUMULL(rd, rn, rs, rm, condOp);
					break;
				case 0x00900000:
					// UMULLS
					op = this.armCompiler.constructUMULLS(rd, rn, rs, rm, condOp);
					break;
				case 0x00A00000:
					// UMLAL
					op = this.armCompiler.constructUMLAL(rd, rn, rs, rm, condOp);
					break;
				case 0x00B00000:
					// UMLALS
					op = this.armCompiler.constructUMLALS(rd, rn, rs, rm, condOp);
					break;
				case 0x00C00000:
					// SMULL
					op = this.armCompiler.constructSMULL(rd, rn, rs, rm, condOp);
					break;
				case 0x00D00000:
					// SMULLS
					op = this.armCompiler.constructSMULLS(rd, rn, rs, rm, condOp);
					break;
				case 0x00E00000:
					// SMLAL
					op = this.armCompiler.constructSMLAL(rd, rn, rs, rm, condOp);
					break;
				case 0x00F00000:
					// SMLALS
					op = this.armCompiler.constructSMLALS(rd, rn, rs, rm, condOp);
					break;
				}
				op.writesPC = rd == this.PC;
			} else {
				// Halfword and signed byte data transfer
				var load = instruction & 0x00100000;
				var rd = (instruction & 0x0000F000) >> 12;
				var hiOffset = (instruction & 0x00000F00) >> 4;
				var loOffset = rm = instruction & 0x0000000F;
				var h = instruction & 0x00000020;
				var s = instruction & 0x00000040;
				var w = instruction & 0x00200000;
				var i = instruction & 0x00400000;

				var address;
				if (i) {
					var immediate = loOffset | hiOffset;
					address = this.armCompiler.constructAddressingMode23Immediate(instruction, immediate, condOp);
				} else {
					address = this.armCompiler.constructAddressingMode23Register(instruction, rm, condOp);
				}
				address.writesPC = !!w && rn == this.PC;

				if ((instruction & 0x00000090) == 0x00000090) {
					if (load) {
						// Load [signed] halfword/byte
						if (h) {
							if (s) {
								// LDRSH
								op = this.armCompiler.constructLDRSH(rd, address, condOp);
							} else {
								// LDRH
								op = this.armCompiler.constructLDRH(rd, address, condOp);
							}
						} else {
							if (s) {
								// LDRSB
								op = this.armCompiler.constructLDRSB(rd, address, condOp);
							}
						}
					} else if (!s && h) {
						// STRH
						op = this.armCompiler.constructSTRH(rd, address, condOp);
					}
				}
				op.writesPC = rd == this.PC || address.writesPC;
			}
			break;
		case 0x04000000:
		case 0x06000000:
			// LDR/STR
			var rd = (instruction & 0x0000F000) >> 12;
			var load = instruction & 0x00100000;
			var b = instruction & 0x00400000;
			var i = instruction & 0x02000000;

			var address = function() {
				throw "Unimplemented memory access: 0x" + instruction.toString(16);
			};
			if (~instruction & 0x01000000) {
				// Clear the W bit if the P bit is clear--we don't support memory translation, so these turn into regular accesses
				instruction &= 0xFFDFFFFF;
			}
			if (i) {
				// Register offset
				var rm = instruction & 0x0000000F;
				var shiftType = instruction & 0x00000060;
				var shiftImmediate = (instruction & 0x00000F80) >> 7;
				
				if (shiftType || shiftImmediate) {
					var shiftOp = this.barrelShiftImmediate(shiftType, shiftImmediate, rm);
					address = this.armCompiler.constructAddressingMode2RegisterShifted(instruction, shiftOp, condOp);
				} else {
					address = this.armCompiler.constructAddressingMode23Register(instruction, rm, condOp);
				}
			} else {
				// Immediate
				var offset = instruction & 0x00000FFF;
				address = this.armCompiler.constructAddressingMode23Immediate(instruction, offset, condOp);
			}
			if (load) {
				if (b) {
					// LDRB
					op = this.armCompiler.constructLDRB(rd, address, condOp);
				} else {
					// LDR
					op = this.armCompiler.constructLDR(rd, address, condOp);
				}
			} else {
				if (b) {
					// STRB
					op = this.armCompiler.constructSTRB(rd, address, condOp);
				} else {
					// STR
					op = this.armCompiler.constructSTR(rd, address, condOp);
				}
			}
			op.writesPC = rd == this.PC || address.writesPC;
			break;
		case 0x08000000:
			// Block data transfer
			var load = instruction & 0x00100000;
			var w = instruction & 0x00200000;
			var user = instruction & 0x00400000;
			var u = instruction & 0x00800000;
			var p = instruction & 0x01000000;
			var rs = instruction & 0x0000FFFF;
			var rn = (instruction & 0x000F0000) >> 16;

			var address;
			var immediate = 0;
			var offset = 0;
			var overlap = false;
			if (u) {
				if (p) {
					immediate = 4;
				}
				for (var m = 0x01, i = 0; i < 16; m <<= 1, ++i) {
					if (rs & m) {
						if (w && i == rn && !offset) {
							rs &= ~m;
							immediate += 4;
							overlap = true;
						}
						offset += 4;
					}
				}
			} else {
				if (!p) {
					immediate = 4;
				}
				for (var m = 0x01, i = 0; i < 16; m <<= 1, ++i) {
					if (rs & m) {
						if (w && i == rn && !offset) {
							rs &= ~m;
							immediate += 4;
							overlap = true;
						}
						immediate -= 4;
						offset -= 4;
					}
				}
			}
			if (w) {
				address = this.armCompiler.constructAddressingMode4Writeback(immediate, offset, rn, overlap);
			} else {
				address = this.armCompiler.constructAddressingMode4(immediate, rn);
			}
			if (load) {
				// LDM
				if (user) {
					op = this.armCompiler.constructLDMS(rs, address, condOp);
				} else {
					op = this.armCompiler.constructLDM(rs, address, condOp);
				}
				op.writesPC = !!(rs & (1 << 15));
			} else {
				// STM
				if (user) {
					op = this.armCompiler.constructSTMS(rs, address, condOp);
				} else {
					op = this.armCompiler.constructSTM(rs, address, condOp);
				}
				op.writesPC = false;
			}
			break;
		case 0x0A000000:
			// Branch
			var immediate = instruction & 0x00FFFFFF;
			if (immediate & 0x00800000) {
				immediate |= 0xFF000000;
			}
			immediate <<= 2;
			var link = instruction & 0x01000000;
			if (link) {
				op = this.armCompiler.constructBL(immediate, condOp);
			} else {
				op = this.armCompiler.constructB(immediate, condOp);
			}
			op.writesPC = true;
			op.fixedJump = true;
			break;
		case 0x0C000000:
			// Coprocessor data transfer
			break;
		case 0x0E000000:
			// Coprocessor data operation/SWI
			if ((instruction & 0x0F000000) == 0x0F000000) {
				// SWI
				var immediate = (instruction & 0x00FFFFFF);
				op = this.armCompiler.constructSWI(immediate, condOp);
				op.writesPC = false;
			}
			break;
		default:
			throw 'Bad opcode: 0x' + instruction.toString(16);
		}
	}

	op.execMode = this.MODE_ARM;
	op.fixedJump = op.fixedJump || false;
	return op;
};

ARMCore.prototype.compileThumb = function(instruction) {
	var op = this.badOp(instruction & 0xFFFF);
	var cpu = this;
	var gprs = this.gprs;
	if ((instruction & 0xFC00) == 0x4000) {
		// Data-processing register
		var rm = (instruction & 0x0038) >> 3;
		var rd = instruction & 0x0007;
		switch (instruction & 0x03C0) {
		case 0x0000:
			// AND
			op = this.thumbCompiler.constructAND(rd, rm);
			break;
		case 0x0040:
			// EOR
			op = this.thumbCompiler.constructEOR(rd, rm);
			break;
		case 0x0080:
			// LSL(2)
			op = this.thumbCompiler.constructLSL2(rd, rm);
			break;
		case 0x00C0:
			// LSR(2)
			op = this.thumbCompiler.constructLSR2(rd, rm);
			break;
		case 0x0100:
			// ASR(2)
			op = this.thumbCompiler.constructASR2(rd, rm);
			break;
		case 0x0140:
			// ADC
			op = this.thumbCompiler.constructADC(rd, rm);
			break;
		case 0x0180:
			// SBC
			op = this.thumbCompiler.constructSBC(rd, rm);
			break;
		case 0x01C0:
			// ROR
			op = this.thumbCompiler.constructROR(rd, rm);
			break;
		case 0x0200:
			// TST
			op = this.thumbCompiler.constructTST(rd, rm);
			break;
		case 0x0240:
			// NEG
			op = this.thumbCompiler.constructNEG(rd, rm);
			break;
		case 0x0280:
			// CMP(2)
			op = this.thumbCompiler.constructCMP2(rd, rm);
			break;
		case 0x02C0:
			// CMN
			op = this.thumbCompiler.constructCMN(rd, rm);
			break;
		case 0x0300:
			// ORR
			op = this.thumbCompiler.constructORR(rd, rm);
			break;
		case 0x0340:
			// MUL
			op = this.thumbCompiler.constructMUL(rd, rm);
			break;
		case 0x0380:
			// BIC
			op = this.thumbCompiler.constructBIC(rd, rm);
			break;
		case 0x03C0:
			// MVN
			op = this.thumbCompiler.constructMVN(rd, rm);
			break;
		}
		op.writesPC = false;
	} else if ((instruction & 0xFC00) == 0x4400) {
		// Special data processing / branch/exchange instruction set
		var rm = (instruction & 0x0078) >> 3;
		var rn = instruction & 0x0007;
		var h1 = instruction & 0x0080;
		var rd = rn | (h1 >> 4);
		switch (instruction & 0x0300) {
		case 0x0000:
			// ADD(4)
			op = this.thumbCompiler.constructADD4(rd, rm)
			op.writesPC = rd == this.PC;
			break;
		case 0x0100:
			// CMP(3)
			op = this.thumbCompiler.constructCMP3(rd, rm);
			op.writesPC = false;
			break;
		case 0x0200:
			// MOV(3)
			op = this.thumbCompiler.constructMOV3(rd, rm);
			op.writesPC = rd == this.PC;
			break;
		case 0x0300:
			// BX
			op = this.thumbCompiler.constructBX(rd, rm);
			op.writesPC = true;
			op.fixedJump = false;
			break;
		}
	} else if ((instruction & 0xF800) == 0x1800) {
		// Add/subtract
		var rm = (instruction & 0x01C0) >> 6;
		var rn = (instruction & 0x0038) >> 3;
		var rd = instruction & 0x0007;
		switch (instruction & 0x0600) {
		case 0x0000:
			// ADD(3)
			op = this.thumbCompiler.constructADD3(rd, rn, rm);
			break;
		case 0x0200:
			// SUB(3)
			op = this.thumbCompiler.constructSUB3(rd, rn, rm);
			break;
		case 0x0400:
			var immediate = (instruction & 0x01C0) >> 6;
			if (immediate) {
				// ADD(1)
				op = this.thumbCompiler.constructADD1(rd, rn, immediate);
			} else {
				// MOV(2)
				op = this.thumbCompiler.constructMOV2(rd, rn, rm);
			}
			break;
		case 0x0600:
			// SUB(1)
			var immediate = (instruction & 0x01C0) >> 6;
			op = this.thumbCompiler.constructSUB1(rd, rn, immediate);
			break;
		}
		op.writesPC = false;
	} else if (!(instruction & 0xE000)) {
		// Shift by immediate
		var rd = instruction & 0x0007;
		var rm = (instruction & 0x0038) >> 3;
		var immediate = (instruction & 0x07C0) >> 6;
		switch (instruction & 0x1800) {
		case 0x0000:
			// LSL(1)
			op = this.thumbCompiler.constructLSL1(rd, rm, immediate);
			break;
		case 0x0800:
			// LSR(1)
			op = this.thumbCompiler.constructLSR1(rd, rm, immediate);
			break;
		case 0x1000:
			// ASR(1)
			op = this.thumbCompiler.constructASR1(rd, rm, immediate);
			break;
		case 0x1800:
			break;
		}
		op.writesPC = false;
	} else if ((instruction & 0xE000) == 0x2000) {
		// Add/subtract/compare/move immediate
		var immediate = instruction & 0x00FF;
		var rn = (instruction & 0x0700) >> 8;
		switch (instruction & 0x1800) {
		case 0x0000:
			// MOV(1)
			op = this.thumbCompiler.constructMOV1(rn, immediate);
			break;
		case 0x0800:
			// CMP(1)
			op = this.thumbCompiler.constructCMP1(rn, immediate);
			break;
		case 0x1000:
			// ADD(2)
			op = this.thumbCompiler.constructADD2(rn, immediate);
			break;
		case 0x1800:
			// SUB(2)
			op = this.thumbCompiler.constructSUB2(rn, immediate);
			break;
		}
		op.writesPC = false;
	} else if ((instruction & 0xF800) == 0x4800) {
		// LDR(3)
		var rd = (instruction & 0x0700) >> 8;
		var immediate = (instruction & 0x00FF) << 2;
		op = this.thumbCompiler.constructLDR3(rd, immediate);
		op.writesPC = false;
	} else if ((instruction & 0xF000) == 0x5000) {
		// Load and store with relative offset
		var rd = instruction & 0x0007;
		var rn = (instruction & 0x0038) >> 3;
		var rm = (instruction & 0x01C0) >> 6;
		var opcode = instruction & 0x0E00;
		switch (opcode) {
		case 0x0000:
			// STR(2)
			op = this.thumbCompiler.constructSTR2(rd, rn, rm);
			break;
		case 0x0200:
			// STRH(2)
			op = this.thumbCompiler.constructSTRH2(rd, rn, rm);
			break;
		case 0x0400:
			// STRB(2)
			op = this.thumbCompiler.constructSTRB2(rd, rn, rm);
			break;
		case 0x0600:
			// LDRSB
			op = this.thumbCompiler.constructLDRSB(rd, rn, rm);
			break;
		case 0x0800:
			// LDR(2)
			op = this.thumbCompiler.constructLDR2(rd, rn, rm);
			break;
		case 0x0A00:
			// LDRH(2)
			op = this.thumbCompiler.constructLDRH2(rd, rn, rm);
			break;
		case 0x0C00:
			// LDRB(2)
			op = this.thumbCompiler.constructLDRB2(rd, rn, rm);
			break;
		case 0x0E00:
			// LDRSH
			op = this.thumbCompiler.constructLDRSH(rd, rn, rm);
			break;
		}
		op.writesPC = false;
	} else if ((instruction & 0xE000) == 0x6000) {
		// Load and store with immediate offset
		var rd = instruction & 0x0007;
		var rn = (instruction & 0x0038) >> 3;
		var immediate = (instruction & 0x07C0) >> 4;
		var b = instruction & 0x1000;
		if (b) {
			immediate >>= 2;
		}
		var load = instruction & 0x0800;
		if (load) {
			if (b) {
				// LDRB(1)
				op = this.thumbCompiler.constructLDRB1(rd, rn, immediate);
			} else {
				// LDR(1)
				op = this.thumbCompiler.constructLDR1(rd, rn, immediate);
			}
		} else {
			if (b) {
				// STRB(1)
				op = this.thumbCompiler.constructSTRB1(rd, rn, immediate);
			} else {
				// STR(1)
				op = this.thumbCompiler.constructSTR1(rd, rn, immediate);
			}
		}
		op.writesPC = false;
	} else if ((instruction & 0xF600) == 0xB400) {
		// Push and pop registers
		var r = !!(instruction & 0x0100);
		var rs = instruction & 0x00FF;
		if (instruction & 0x0800) {
			// POP
			op = this.thumbCompiler.constructPOP(rs, r);
			op.writesPC = r;
			op.fixedJump = false;
		} else {
			// PUSH
			op = this.thumbCompiler.constructPUSH(rs, r);
			op.writesPC = false;
		}
	} else if (instruction & 0x8000) {
		switch (instruction & 0x7000) {
		case 0x0000:
			// Load and store halfword
			var rd = instruction & 0x0007;
			var rn = (instruction & 0x0038) >> 3;
			var immediate = (instruction & 0x07C0) >> 5;
			if (instruction & 0x0800) {
				// LDRH(1)
				op = this.thumbCompiler.constructLDRH1(rd, rn, immediate);
			} else {
				// STRH(1)
				op = this.thumbCompiler.constructSTRH1(rd, rn, immediate);
			}
			op.writesPC = false;
			break;
		case 0x1000:
			// SP-relative load and store
			var rd = (instruction & 0x0700) >> 8;
			var immediate = (instruction & 0x00FF) << 2;
			var load = instruction & 0x0800;
			if (load) {
				// LDR(4)
				op = this.thumbCompiler.constructLDR4(rd, immediate);
			} else {
				// STR(3)
				op = this.thumbCompiler.constructSTR3(rd, immediate);
			}
			op.writesPC = false;
			break;
		case 0x2000:
			// Load address
			var rd = (instruction & 0x0700) >> 8;
			var immediate = (instruction & 0x00FF) << 2;
			if (instruction & 0x0800) {
				// ADD(6)
				op = this.thumbCompiler.constructADD6(rd, immediate);
			} else {
				// ADD(5)
				op = this.thumbCompiler.constructADD5(rd, immediate);
			}
			op.writesPC = false;
			break;
		case 0x3000:
			// Miscellaneous
			if (!(instruction & 0x0F00)) {
				// Adjust stack pointer
				// ADD(7)/SUB(4)
				var b = instruction & 0x0080;
				var immediate = (instruction & 0x7F) << 2;
				if (b) {
					immediate = -immediate;
				}
				op = this.thumbCompiler.constructADD7(immediate)
				op.writesPC = false;
			}
			break;
		case 0x4000:
			// Multiple load and store
			var rn = (instruction & 0x0700) >> 8;
			var rs = instruction & 0x00FF;
			if (instruction & 0x0800) {
				// LDMIA
				op = this.thumbCompiler.constructLDMIA(rn, rs);
			} else {
				// STMIA
				op = this.thumbCompiler.constructSTMIA(rn, rs);
			}
			op.writesPC = false;
			break;
		case 0x5000:
			// Conditional branch
			var cond = (instruction & 0x0F00) >> 8;
			var immediate = (instruction & 0x00FF);
			if (cond == 0xF) {
				// SWI
				op = this.thumbCompiler.constructSWI(immediate);
				op.writesPC = false;
			} else {
				// B(1)
				if (instruction & 0x0080) {
					immediate |= 0xFFFFFF00;
				}
				immediate <<= 1;
				var condOp = this.conds[cond];
				op = this.thumbCompiler.constructB1(immediate, condOp);
				op.writesPC = true;
				op.fixedJump = true;
			}
			break;
		case 0x6000:
		case 0x7000:
			// BL(X)
			var immediate = instruction & 0x07FF;
			var h = instruction & 0x1800;
			switch (h) {
			case 0x0000:
				// B(2)
				if (immediate & 0x0400) {
					immediate |= 0xFFFFF800;
				}
				immediate <<= 1;
				op = this.thumbCompiler.constructB2(immediate);
				op.writesPC = true;
				op.fixedJump = true;
				break;
			case 0x0800:
				// BLX (ARMv5T)
				/*op = function() {
					var pc = gprs[cpu.PC];
					gprs[cpu.PC] = (gprs[cpu.LR] + (immediate << 1)) & 0xFFFFFFFC;
					gprs[cpu.LR] = pc - 1;
					cpu.switchExecMode(cpu.MODE_ARM);
				}*/
				break;
			case 0x1000:
				// BL(1)
				if (immediate & 0x0400) {
					immediate |= 0xFFFFFC00;
				}
				immediate <<= 12;
				op = this.thumbCompiler.constructBL1(immediate);
				op.writesPC = false;
				break;
			case 0x1800:
				// BL(2)
				op = this.thumbCompiler.constructBL2(immediate);
				op.writesPC = true;
				op.fixedJump = false;
				break;
			}
			break;
		default:
			this.WARN("Undefined instruction: 0x" + instruction.toString(16));
		}
	} else {
		throw 'Bad opcode: 0x' + instruction.toString(16);
	}

	op.execMode = this.MODE_THUMB;
	op.fixedJump = op.fixedJump || false;
	return op;
};

ARMCoreArm = function (cpu) {
	this.cpu = cpu;

	this.addressingMode23Immediate = [
		// 000x0
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					gprs[rn] -= offset;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		// 000xW
		null,

		null,
		null,

		// 00Ux0
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					gprs[rn] += offset;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		// 00UxW
		null,

		null,
		null,

		// 0P0x0
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				return addr = gprs[rn] - offset;
			};
			address.writesPC = false;
			return address;
		},

		// 0P0xW
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn] - offset;
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		null,
		null,

		// 0PUx0
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				return addr = gprs[rn] + offset;
			};
			address.writesPC = false;
			return address;
		},

		// 0PUxW
		function(rn, offset, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn] + offset;
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		null,
		null,
	];

	this.addressingMode23Register = [
		// I00x0
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					gprs[rn] -= gprs[rm];
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		// I00xW
		null,

		null,
		null,

		// I0Ux0
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					gprs[rn] += gprs[rm];
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		// I0UxW
		null,

		null,
		null,

		// IP0x0
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				return gprs[rn] - gprs[rm];
			};
			address.writesPC = false;
			return address;
		},

		// IP0xW
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn] - gprs[rm];
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		null,
		null,

		// IPUx0
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn] + gprs[rm];
				return addr;
			};
			address.writesPC = false;
			return address;
		},

		// IPUxW
		function(rn, rm, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn] + gprs[rm];
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		null,
		null
	];

	this.addressingMode2RegisterShifted = [
		// I00x0
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					shiftOp();
					gprs[rn] -= cpu.shifterOperand;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		// I00xW
		null,

		null,
		null,

		// I0Ux0
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				var addr = gprs[rn];
				if (!condOp || condOp()) {
					shiftOp();
					gprs[rn] += cpu.shifterOperand;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},
		// I0UxW
		null,

		null,
		null,

		// IP0x0
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				shiftOp();
				return gprs[rn] - cpu.shifterOperand;
			};
			address.writesPC = false;
			return address;
		},

		// IP0xW
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				shiftOp();
				var addr = gprs[rn] - cpu.shifterOperand;
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writesPC = rn == cpu.PC;
			return address;
		},

		null,
		null,

		// IPUx0
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				shiftOp();
				return gprs[rn] + cpu.shifterOperand;
			};
			address.writesPC = false;
			return address;
		},

		// IPUxW
		function(rn, shiftOp, condOp) {
			var gprs = cpu.gprs;
			var address = function() {
				shiftOp();
				var addr = gprs[rn] + cpu.shifterOperand;
				if (!condOp || condOp()) {
					gprs[rn] = addr;
				}
				return addr;
			};
			address.writePC = rn == cpu.PC;
			return address;
		},

		null,
		null,
	];
}

ARMCoreArm.prototype.constructAddressingMode1ASR = function(rs, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		++cpu.cycles;
		var shift = gprs[rs];
		if (rs == cpu.PC) {
			shift += 4;
		}
		shift &= 0xFF;
		var shiftVal =  gprs[rm];
		if (rm == cpu.PC) {
			shiftVal += 4;
		}
		if (shift == 0) {
			cpu.shifterOperand = shiftVal;
			cpu.shifterCarryOut = cpu.cpsrC;
		} else if (shift < 32) {
			cpu.shifterOperand = shiftVal >> shift;
			cpu.shifterCarryOut = shiftVal & (1 << (shift - 1));
		} else if (gprs[rm] >> 31) {
			cpu.shifterOperand = 0xFFFFFFFF;
			cpu.shifterCarryOut = 0x80000000;
		} else {
			cpu.shifterOperand = 0;
			cpu.shifterCarryOut = 0;
		}
	};
};

ARMCoreArm.prototype.constructAddressingMode1Immediate = function(immediate) {
	var cpu = this.cpu;
	return function() {
		cpu.shifterOperand = immediate;
		cpu.shifterCarryOut = cpu.cpsrC;
	};
};

ARMCoreArm.prototype.constructAddressingMode1ImmediateRotate = function(immediate, rotate) {
	var cpu = this.cpu;
	return function() {
		cpu.shifterOperand = (immediate >>> rotate) | (immediate << (32 - rotate));
		cpu.shifterCarryOut = cpu.shifterOperand >> 31;
	}
};

ARMCoreArm.prototype.constructAddressingMode1LSL = function(rs, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		++cpu.cycles;
		var shift = gprs[rs];
		if (rs == cpu.PC) {
			shift += 4;
		}
		shift &= 0xFF;
		var shiftVal =  gprs[rm];
		if (rm == cpu.PC) {
			shiftVal += 4;
		}
		if (shift == 0) {
			cpu.shifterOperand = shiftVal;
			cpu.shifterCarryOut = cpu.cpsrC;
		} else if (shift < 32) {
			cpu.shifterOperand = shiftVal << shift;
			cpu.shifterCarryOut = shiftVal & (1 << (32 - shift));
		} else if (shift == 32) {
			cpu.shifterOperand = 0;
			cpu.shifterCarryOut = shiftVal & 1;
		} else {
			cpu.shifterOperand = 0;
			cpu.shifterCarryOut = 0;
		}
	};
};

ARMCoreArm.prototype.constructAddressingMode1LSR = function(rs, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		++cpu.cycles;
		var shift = gprs[rs];
		if (rs == cpu.PC) {
			shift += 4;
		}
		shift &= 0xFF;
		var shiftVal =  gprs[rm];
		if (rm == cpu.PC) {
			shiftVal += 4;
		}
		if (shift == 0) {
			cpu.shifterOperand = shiftVal;
			cpu.shifterCarryOut = cpu.cpsrC;
		} else if (shift < 32) {
			cpu.shifterOperand = shiftVal >>> shift;
			cpu.shifterCarryOut = shiftVal & (1 << (shift - 1));
		} else if (shift == 32) {
			cpu.shifterOperand = 0;
			cpu.shifterCarryOut = shiftVal >> 31;
		} else {
			cpu.shifterOperand = 0;
			cpu.shifterCarryOut = 0;
		}
	};
};

ARMCoreArm.prototype.constructAddressingMode1ROR = function(rs, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		++cpu.cycles;
		var shift = gprs[rs];
		if (rs == cpu.PC) {
			shift += 4;
		}
		shift &= 0xFF;
		var shiftVal =  gprs[rm];
		if (rm == cpu.PC) {
			shiftVal += 4;
		}
		var rotate = shift & 0x1F;
		if (shift == 0) {
			cpu.shifterOperand = shiftVal;
			cpu.shifterCarryOut = cpu.cpsrC;
		} else if (rotate) {
			cpu.shifterOperand = (gprs[rm] >>> rotate) | (gprs[rm] << (32 - rotate));
			cpu.shifterCarryOut = shiftVal & (1 << (rotate - 1));
		} else {
			cpu.shifterOperand = shiftVal;
			cpu.shifterCarryOut = shiftVal >> 31;
		}
	};
};

ARMCoreArm.prototype.constructAddressingMode23Immediate = function(instruction, immediate, condOp) {
	var rn = (instruction & 0x000F0000) >> 16;
	return this.addressingMode23Immediate[(instruction & 0x01A00000) >> 21](rn, immediate, condOp);
};

ARMCoreArm.prototype.constructAddressingMode23Register = function(instruction, rm, condOp) {
	var rn = (instruction & 0x000F0000) >> 16;
	return this.addressingMode23Register[(instruction & 0x01A00000) >> 21](rn, rm, condOp);
};

ARMCoreArm.prototype.constructAddressingMode2RegisterShifted = function(instruction, shiftOp, condOp) {
	var rn = (instruction & 0x000F0000) >> 16;
	return this.addressingMode2RegisterShifted[(instruction & 0x01A00000) >> 21](rn, shiftOp, condOp);
};

ARMCoreArm.prototype.constructAddressingMode4 = function(immediate, rn) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var addr = gprs[rn] + immediate;
		return addr;
	}
};

ARMCoreArm.prototype.constructAddressingMode4Writeback = function(immediate, offset, rn, overlap) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function(writeInitial) {
		var addr = gprs[rn] + immediate;
		if (writeInitial && overlap) {
			cpu.mmu.store32(gprs[rn] + immediate - 4, gprs[rn]);
		}
		gprs[rn] += offset;
		return addr;
	}
};

ARMCoreArm.prototype.constructADC = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var shifterOperand = (cpu.shifterOperand >>> 0) + !!cpu.cpsrC;
		gprs[rd] = (gprs[rn] >>> 0) + shifterOperand;
	};
};

ARMCoreArm.prototype.constructADCS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var shifterOperand = (cpu.shifterOperand >>> 0) + !!cpu.cpsrC;
		var d = (gprs[rn] >>> 0) + shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = d > 0xFFFFFFFF;
			cpu.cpsrV = (gprs[rn] >> 31) == (shifterOperand >> 31) &&
						(gprs[rn] >> 31) != (d >> 31) &&
						(shifterOperand >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructADD = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = (gprs[rn] >>> 0) + (cpu.shifterOperand >>> 0);
	};
};

ARMCoreArm.prototype.constructADDS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var d = (gprs[rn] >>> 0) + (cpu.shifterOperand >>> 0);
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = d > 0xFFFFFFFF;
			cpu.cpsrV = (gprs[rn] >> 31) == (cpu.shifterOperand >> 31) &&
						(gprs[rn] >> 31) != (d >> 31) &&
						(cpu.shifterOperand >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructAND = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] & cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructANDS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] & cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructB = function(immediate, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		gprs[cpu.PC] += immediate;
	};
};

ARMCoreArm.prototype.constructBIC = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] & ~cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructBICS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] & ~cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructBL = function(immediate, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		gprs[cpu.LR] = gprs[cpu.PC] - 4;
		gprs[cpu.PC] += immediate;
	};
};

ARMCoreArm.prototype.constructBX = function(rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		cpu.switchExecMode(gprs[rm] & 0x00000001);
		gprs[cpu.PC] = gprs[rm] & 0xFFFFFFFE;
	};
};

ARMCoreArm.prototype.constructCMN = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var aluOut = (gprs[rn] >>> 0) + (cpu.shifterOperand >>> 0);
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = aluOut > 0xFFFFFFFF;
		cpu.cpsrV = (gprs[rn] >> 31) == (cpu.shifterOperand >> 31) &&
					(gprs[rn] >> 31) != (aluOut >> 31) &&
					(cpu.shifterOperand >> 31) != (aluOut >> 31);
	};
};

ARMCoreArm.prototype.constructCMP = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var aluOut = gprs[rn] - cpu.shifterOperand;
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rn] >>> 0) >= (cpu.shifterOperand >>> 0);
		cpu.cpsrV = (gprs[rn] >> 31) != (cpu.shifterOperand >> 31) &&
					(gprs[rn] >> 31) != (aluOut >> 31);
	};
};

ARMCoreArm.prototype.constructEOR = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] ^ cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructEORS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] ^ cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructLDM = function(rs, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	var mmu = cpu.mmu;
	return function() {
		mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address(false);
		var total = 0;
		var m, i;
		for (m = rs, i = 0; m; m >>= 1, ++i) {
			if (m & 1) {
				gprs[i] = mmu.load32(addr & 0xFFFFFFFC);
				addr += 4;
				++total;
			}
		}
		mmu.waitMulti32(addr, total);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDMS = function(rs, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	var mmu = cpu.mmu;
	return function() {
		mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address(false);
		var total = 0;
		var mode = cpu.mode;
		cpu.switchMode(cpu.MODE_SYSTEM);
		var m, i;
		for (m = rs, i = 0; m; m >>= 1, ++i) {
			if (m & 1) {
				gprs[i] = mmu.load32(addr & 0xFFFFFFFC);
				addr += 4;
				++total;
			}
		}
		cpu.switchMode(mode);
		mmu.waitMulti32(addr, total);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDR = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address();
		gprs[rd] = cpu.mmu.load32(addr);
		cpu.mmu.wait32(addr);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDRB = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address();
		gprs[rd] = cpu.mmu.loadU8(addr);
		cpu.mmu.wait(addr);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDRH = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address();
		gprs[rd] = cpu.mmu.loadU16(addr);
		cpu.mmu.wait(addr);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDRSB = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address();
		gprs[rd] = cpu.mmu.load8(addr);
		cpu.mmu.wait(addr);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructLDRSH = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var addr = address();
		gprs[rd] = cpu.mmu.load16(addr);
		cpu.mmu.wait(addr);
		++cpu.cycles;
	};
};

ARMCoreArm.prototype.constructMLA = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(rs);
		if ((gprs[rm] & 0xFFFF0000) && (gprs[rs] & 0xFFFF0000)) {
			// Our data type is a double--we'll lose bits if we do it all at once!
			var hi = ((gprs[rm] & 0xFFFF0000) * gprs[rs]) & 0xFFFFFFFF;
			var lo = ((gprs[rm] & 0x0000FFFF) * gprs[rs]) & 0xFFFFFFFF;
			gprs[rd] = (hi + lo + gprs[rn]) & 0xFFFFFFFF;
		} else {
			gprs[rd] = gprs[rm] * gprs[rs] + gprs[rn];
		}
	};
};

ARMCoreArm.prototype.constructMLAS = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(rs);
		if ((gprs[rm] & 0xFFFF0000) && (gprs[rs] & 0xFFFF0000)) {
			// Our data type is a double--we'll lose bits if we do it all at once!
			var hi = ((gprs[rm] & 0xFFFF0000) * gprs[rs]) & 0xFFFFFFFF;
			var lo = ((gprs[rm] & 0x0000FFFF) * gprs[rs]) & 0xFFFFFFFF;
			gprs[rd] = (hi + lo + gprs[rn]) & 0xFFFFFFFF;
		} else {
			gprs[rd] = gprs[rm] * gprs[rs] + gprs[rn];
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreArm.prototype.constructMOV = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructMOVS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructMRS = function(rd, r, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		if (r) {
			gprs[rd] = cpu.spsr;
		} else {
			gprs[rd] = cpu.packCPSR();
		}
	};
};

ARMCoreArm.prototype.constructMSR = function(rm, r, instruction, immediate, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	var c = instruction & 0x00010000;
	//var x = instruction & 0x00020000;
	//var s = instruction & 0x00040000;
	var f = instruction & 0x00080000;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		var operand;
		if (instruction & 0x02000000) {
			operand = immediate;
		} else {
			operand = gprs[rm];
		}
		var mask = (c ? 0x000000FF : 0x00000000) |
				   //(x ? 0x0000FF00 : 0x00000000) | // Irrelevant on ARMv4T
				   //(s ? 0x00FF0000 : 0x00000000) | // Irrelevant on ARMv4T
				   (f ? 0xFF000000 : 0x00000000);

		if (r) {
			mask &= cpu.USER_MASK | cpu.PRIV_MASK | cpu.STATE_MASK;
			cpu.spsr = (cpu.spsr & ~mask) | (operand & mask);
		} else {
			if (mask & cpu.USER_MASK) {
				cpu.cpsrN = operand >> 31;
				cpu.cpsrZ = operand & 0x40000000;
				cpu.cpsrC = operand & 0x20000000;
				cpu.cpsrV = operand & 0x10000000;
			}
			if (cpu.mode != cpu.MODE_USER && (mask & cpu.PRIV_MASK)) {
				cpu.switchMode((operand & 0x0000000F) | 0x00000010);
				cpu.cpsrI = operand & 0x00000080;
				cpu.cpsrF = operand & 0x00000040;
			}
		}
	};
};

ARMCoreArm.prototype.constructMUL = function(rd, rs, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.mmu.waitMul(gprs[rs]);
		if ((gprs[rm] & 0xFFFF0000) && (gprs[rs] & 0xFFFF0000)) {
			// Our data type is a double--we'll lose bits if we do it all at once!
			var hi = ((gprs[rm] & 0xFFFF0000) * gprs[rs]) | 0;
			var lo = ((gprs[rm] & 0x0000FFFF) * gprs[rs]) | 0;
			gprs[rd] = hi + lo;
		} else {
			gprs[rd] = gprs[rm] * gprs[rs];
		}
	};
};

ARMCoreArm.prototype.constructMULS = function(rd, rs, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.mmu.waitMul(gprs[rs]);
		if ((gprs[rm] & 0xFFFF0000) && (gprs[rs] & 0xFFFF0000)) {
			// Our data type is a double--we'll lose bits if we do it all at once!
			var hi = ((gprs[rm] & 0xFFFF0000) * gprs[rs]) | 0;
			var lo = ((gprs[rm] & 0x0000FFFF) * gprs[rs]) | 0;
			gprs[rd] = hi + lo;
		} else {
			gprs[rd] = gprs[rm] * gprs[rs];
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreArm.prototype.constructMVN = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = ~cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructMVNS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = ~cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructORR = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] | cpu.shifterOperand;
	}
};

ARMCoreArm.prototype.constructORRS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] | cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = gprs[rd] >> 31;
			cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
			cpu.cpsrC = cpu.shifterCarryOut;
		}
	};
};

ARMCoreArm.prototype.constructRSB = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = cpu.shifterOperand - gprs[rn];
	};
};

ARMCoreArm.prototype.constructRSBS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var d = cpu.shifterOperand - gprs[rn];
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = (cpu.shifterOperand >>> 0) >= (gprs[rn] >>> 0);
			cpu.cpsrV = (cpu.shifterOperand >> 31) != (gprs[rn] >> 31) &&
						(cpu.shifterOperand >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructRSC = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var n = (gprs[rn] >>> 0) + !cpu.cpsrC;
		gprs[rd] = (cpu.shifterOperand >>> 0) - n;
	};
};

ARMCoreArm.prototype.constructRSCS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var n = (gprs[rn] >>> 0) + !cpu.cpsrC;
		var d = (cpu.shifterOperand >>> 0) - n;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = (cpu.shifterOperand >>> 0) >= (d >>> 0);
			cpu.cpsrV = (cpu.shifterOperand >> 31) != (n >> 31) &&
						(cpu.shifterOperand >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructSBC = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var shifterOperand = (cpu.shifterOperand >>> 0) + !cpu.cpsrC;
		gprs[rd] = (gprs[rn] >>> 0) - shifterOperand;
	};
};

ARMCoreArm.prototype.constructSBCS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var shifterOperand = (cpu.shifterOperand >>> 0) + !cpu.cpsrC;
		var d = (gprs[rn] >>> 0) - shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = (gprs[rn] >>> 0) >= (d >>> 0);
			cpu.cpsrV = (gprs[rn] >> 31) != (shifterOperand >> 31) &&
						(gprs[rn] >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructSMLAL = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.cycles += 2;
		cpu.mmu.waitMul(rs);
		var hi = (gprs[rm] & 0xFFFF0000) * gprs[rs];
		var lo = (gprs[rm] & 0x0000FFFF) * gprs[rs];
		var carry = (gprs[rn] >>> 0) + hi + lo;
		gprs[rn] = carry;
		gprs[rd] += Math.floor(carry * SHIFT_32);
	};
};

ARMCoreArm.prototype.constructSMLALS = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.cycles += 2;
		cpu.mmu.waitMul(rs);
		var hi = (gprs[rm] & 0xFFFF0000) * gprs[rs];
		var lo = (gprs[rm] & 0x0000FFFF) * gprs[rs];
		var carry = (gprs[rn] >>> 0) + hi + lo;
		gprs[rn] = carry;
		gprs[rd] += Math.floor(carry * SHIFT_32);
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !((gprs[rd] & 0xFFFFFFFF) || (gprs[rn] & 0xFFFFFFFF));
	};
};

ARMCoreArm.prototype.constructSMULL = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(gprs[rs]);
		var hi = ((gprs[rm] & 0xFFFF0000) >> 0) * (gprs[rs] >> 0);
		var lo = ((gprs[rm] & 0x0000FFFF) >> 0) * (gprs[rs] >> 0);
		gprs[rn] = ((hi & 0xFFFFFFFF) + (lo & 0xFFFFFFFF)) & 0xFFFFFFFF;
		gprs[rd] = Math.floor(hi * SHIFT_32 + lo * SHIFT_32);
	};
};

ARMCoreArm.prototype.constructSMULLS = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(gprs[rs]);
		var hi = ((gprs[rm] & 0xFFFF0000) >> 0) * (gprs[rs] >> 0);
		var lo = ((gprs[rm] & 0x0000FFFF) >> 0) * (gprs[rs] >> 0);
		gprs[rn] = ((hi & 0xFFFFFFFF) + (lo & 0xFFFFFFFF)) & 0xFFFFFFFF;
		gprs[rd] = Math.floor(hi * SHIFT_32 + lo * SHIFT_32);
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !((gprs[rd] & 0xFFFFFFFF) || (gprs[rn] & 0xFFFFFFFF));
	};
};

ARMCoreArm.prototype.constructSTM = function(rs, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	var mmu = cpu.mmu;
	return function() {
		if (condOp && !condOp()) {
			mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		mmu.wait32(gprs[cpu.PC]);
		var addr = address(true);
		var total = 0;
		var m, i;
		for (m = rs, i = 0; m; m >>= 1, ++i) {
			if (m & 1) {
				mmu.store32(addr, gprs[i]);
				addr += 4;
				++total;
			}
		}
		mmu.waitMulti32(addr, total);
	};
};

ARMCoreArm.prototype.constructSTMS = function(rs, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	var mmu = cpu.mmu;
	return function() {
		if (condOp && !condOp()) {
			mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		mmu.wait32(gprs[cpu.PC]);
		var mode = cpu.mode;
		var addr = address(true);
		var total = 0;
		var m, i;
		cpu.switchMode(cpu.MODE_SYSTEM);
		for (m = rs, i = 0; m; m >>= 1, ++i) {
			if (m & 1) {
				mmu.store32(addr, gprs[i]);
				addr += 4;
				++total;
			}
		}
		cpu.switchMode(mode);
		mmu.waitMulti32(addr, total);
	};
};

ARMCoreArm.prototype.constructSTR = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		var addr = address();
		cpu.mmu.store32(addr, gprs[rd]);
		cpu.mmu.wait32(addr);
		cpu.mmu.wait32(gprs[cpu.PC]);
	};
};

ARMCoreArm.prototype.constructSTRB = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		var addr = address();
		cpu.mmu.store8(addr, gprs[rd]);
		cpu.mmu.wait(addr);
		cpu.mmu.wait32(gprs[cpu.PC]);
	};
};

ARMCoreArm.prototype.constructSTRH = function(rd, address, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		var addr = address();
		cpu.mmu.store16(addr, gprs[rd]);
		cpu.mmu.wait(addr);
		cpu.mmu.wait32(gprs[cpu.PC]);
	};
};

ARMCoreArm.prototype.constructSUB = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		gprs[rd] = gprs[rn] - cpu.shifterOperand;
	};
};

ARMCoreArm.prototype.constructSUBS = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var d = gprs[rn] - cpu.shifterOperand;
		if (rd == cpu.PC && cpu.hasSPSR()) {
			cpu.unpackCPSR(cpu.spsr);
		} else {
			cpu.cpsrN = d >> 31;
			cpu.cpsrZ = !(d & 0xFFFFFFFF);
			cpu.cpsrC = (gprs[rn] >>> 0) >= (cpu.shifterOperand >>> 0);
			cpu.cpsrV = (gprs[rn] >> 31) != (cpu.shifterOperand >> 31) &&
						(gprs[rn] >> 31) != (d >> 31);
		}
		gprs[rd] = d;
	};
};

ARMCoreArm.prototype.constructSWI = function(immediate, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		if (condOp && !condOp()) {
			cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
			return;
		}
		cpu.irq.swi32(immediate);
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
	};
};

ARMCoreArm.prototype.constructSWP = function(rd, rn, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.mmu.wait32(gprs[rn]);
		cpu.mmu.wait32(gprs[rn]);
		var d = cpu.mmu.load32(gprs[rn]);
		cpu.mmu.store32(gprs[rn], gprs[rm]);
		gprs[rd] = d;
		++cpu.cycles;
	}
};

ARMCoreArm.prototype.constructSWPB = function(rd, rn, rm, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.mmu.wait(gprs[rn]);
		cpu.mmu.wait(gprs[rn]);
		var d = cpu.mmu.load8(gprs[rn]);
		cpu.mmu.store8(gprs[rn], gprs[rm]);
		gprs[rd] = d;
		++cpu.cycles;
	}
};

ARMCoreArm.prototype.constructTEQ = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var aluOut = gprs[rn] ^ cpu.shifterOperand;
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = cpu.shifterCarryOut;
	};
};

ARMCoreArm.prototype.constructTST = function(rd, rn, shiftOp, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		shiftOp();
		var aluOut = gprs[rn] & cpu.shifterOperand;
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = cpu.shifterCarryOut;
	};
};

ARMCoreArm.prototype.constructUMLAL = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.cycles += 2;
		cpu.mmu.waitMul(rs);
		var hi = ((gprs[rm] & 0xFFFF0000) >>> 0) * (gprs[rs] >>> 0);
		var lo = (gprs[rm] & 0x0000FFFF) * (gprs[rs] >>> 0);
		var carry = (gprs[rn] >>> 0) + hi + lo;
		gprs[rn] = carry;
		gprs[rd] += carry * SHIFT_32;
	};
};

ARMCoreArm.prototype.constructUMLALS = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		cpu.cycles += 2;
		cpu.mmu.waitMul(rs);
		var hi = ((gprs[rm] & 0xFFFF0000) >>> 0) * (gprs[rs] >>> 0);
		var lo = (gprs[rm] & 0x0000FFFF) * (gprs[rs] >>> 0);
		var carry = (gprs[rn] >>> 0) + hi + lo;
		gprs[rn] = carry;
		gprs[rd] += carry * SHIFT_32;
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !((gprs[rd] & 0xFFFFFFFF) || (gprs[rn] & 0xFFFFFFFF));
	};
};

ARMCoreArm.prototype.constructUMULL = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(gprs[rs]);
		var hi = ((gprs[rm] & 0xFFFF0000) >>> 0) * (gprs[rs] >>> 0);
		var lo = ((gprs[rm] & 0x0000FFFF) >>> 0) * (gprs[rs] >>> 0);
		gprs[rn] = ((hi & 0xFFFFFFFF) + (lo & 0xFFFFFFFF)) & 0xFFFFFFFF;
		gprs[rd] = (hi * SHIFT_32 + lo * SHIFT_32) >>> 0;
	};
};

ARMCoreArm.prototype.constructUMULLS = function(rd, rn, rs, rm, condOp) {
	var cpu = this.cpu;
	var SHIFT_32 = 1/0x100000000;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch32(gprs[cpu.PC]);
		if (condOp && !condOp()) {
			return;
		}
		++cpu.cycles;
		cpu.mmu.waitMul(gprs[rs]);
		var hi = ((gprs[rm] & 0xFFFF0000) >>> 0) * (gprs[rs] >>> 0);
		var lo = ((gprs[rm] & 0x0000FFFF) >>> 0) * (gprs[rs] >>> 0);
		gprs[rn] = ((hi & 0xFFFFFFFF) + (lo & 0xFFFFFFFF)) & 0xFFFFFFFF;
		gprs[rd] = (hi * SHIFT_32 + lo * SHIFT_32) >>> 0;
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !((gprs[rd] & 0xFFFFFFFF) || (gprs[rn] & 0xFFFFFFFF));
	};
};

ARMCoreThumb = function (cpu) {
	this.cpu = cpu;
};

ARMCoreThumb.prototype.constructADC = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var m = (gprs[rm] >>> 0) + !!cpu.cpsrC;
		var oldD = gprs[rd];
		var d = (oldD >>> 0) + m;
		var oldDn = oldD >> 31;
		var dn = d >> 31;
		var mn = m >> 31;
		cpu.cpsrN = dn;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = d > 0xFFFFFFFF;
		cpu.cpsrV = oldDn == mn && oldDn != dn && mn != dn;
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructADD1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = (gprs[rn] >>> 0) + immediate;
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = d > 0xFFFFFFFF;
		cpu.cpsrV = !(gprs[rn] >> 31) && ((gprs[rn] >> 31 ^ d) >> 31) && (d >> 31);
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructADD2 = function(rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = (gprs[rn] >>> 0) + immediate;
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = d > 0xFFFFFFFF;
		cpu.cpsrV = !(gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31) && ((immediate ^ d) >> 31);
		gprs[rn] = d;
	};
};

ARMCoreThumb.prototype.constructADD3 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = (gprs[rn] >>> 0) + (gprs[rm] >>> 0);
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = d > 0xFFFFFFFF;
		cpu.cpsrV = !((gprs[rn] ^ gprs[rm]) >> 31) && ((gprs[rn] ^ d) >> 31) && ((gprs[rm] ^ d) >> 31);
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructADD4 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] += gprs[rm];
	};
};

ARMCoreThumb.prototype.constructADD5 = function(rd, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = (gprs[cpu.PC] & 0xFFFFFFFC) + immediate;
	};
};

ARMCoreThumb.prototype.constructADD6 = function(rd, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[cpu.SP] + immediate;
	};
};

ARMCoreThumb.prototype.constructADD7 = function(immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[cpu.SP] += immediate;
	};
};

ARMCoreThumb.prototype.constructAND = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[rd] & gprs[rm];
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructASR1 = function(rd, rm, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		if (immediate == 0) {
			cpu.cpsrC = gprs[rm] >> 31;
			if (cpu.cpsrC) {
				gprs[rd] = 0xFFFFFFFF;
			} else {
				gprs[rd] = 0;
			}
		} else {
			cpu.cpsrC = gprs[rm] & (1 << (immediate - 1));
			gprs[rd] = gprs[rm] >> immediate;
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructASR2 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var rs = gprs[rm] & 0xFF;
		if (rs) {
			if (rs < 32) {
				cpu.cpsrC = gprs[rd] & (1 << (rs - 1));
				gprs[rd] >>= rs;
			} else {
				cpu.cpsrC = gprs[rd] >> 31;
				if (cpu.cpsrC) {
					gprs[rd] = 0xFFFFFFFF;
				} else {
					gprs[rd] = 0;
				}
			}
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructB1 = function(immediate, condOp) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		if (condOp()) {
			gprs[cpu.PC] += immediate;
		}
	};
};

ARMCoreThumb.prototype.constructB2 = function(immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[cpu.PC] += immediate;
	};
};

ARMCoreThumb.prototype.constructBIC = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[rd] & ~gprs[rm];
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructBL1 = function(immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[cpu.LR] = gprs[cpu.PC] + immediate;
	}
};

ARMCoreThumb.prototype.constructBL2 = function(immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var pc = gprs[cpu.PC];
		gprs[cpu.PC] = gprs[cpu.LR] + (immediate << 1);
		gprs[cpu.LR] = pc - 1;
	}
};

ARMCoreThumb.prototype.constructBX = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		cpu.switchExecMode(gprs[rm] & 0x00000001);
		var misalign = 0;
		if (rm == 15) {
			misalign = gprs[rm] & 0x00000002;
		}
		gprs[cpu.PC] = gprs[rm] & 0xFFFFFFFE - misalign;
	};
};

ARMCoreThumb.prototype.constructCMN = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var aluOut = (gprs[rd] >>> 0) + (gprs[rm] >>> 0);
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = aluOut > 0xFFFFFFFF;
		cpu.cpsrV = (gprs[rd] >> 31) == (gprs[rm] >> 31) &&
					(gprs[rd] >> 31) != (aluOut >> 31) &&
					(gprs[rm] >> 31) != (aluOut >> 31);
	};
};

ARMCoreThumb.prototype.constructCMP1 = function(rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var aluOut = gprs[rn] - immediate;
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
		cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ aluOut) >> 31);
	};
}

ARMCoreThumb.prototype.constructCMP2 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = gprs[rd];
		var m = gprs[rm];
		var aluOut = d - m;
		var an = aluOut >> 31;
		var dn = d >> 31;
		cpu.cpsrN = an;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = (d >>> 0) >= (m >>> 0);
		cpu.cpsrV = dn != (m >> 31) && dn != an;
	};
};

ARMCoreThumb.prototype.constructCMP3 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var aluOut = gprs[rd] - gprs[rm];
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rd] >>> 0) >= (gprs[rm] >>> 0);
		cpu.cpsrV = ((gprs[rd] ^ gprs[rm]) >> 31) && ((gprs[rd] ^ aluOut) >> 31);
	};
};

ARMCoreThumb.prototype.constructEOR = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[rd] ^ gprs[rm];
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructLDMIA = function(rn, rs) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var address = gprs[rn];
		var total = 0;
		var m, i;
		for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
			if (rs & m) {
				gprs[i] = cpu.mmu.load32(address);
				address += 4;
				++total;
			}
		}
		cpu.mmu.waitMulti32(address, total);
		if (!((1 << rn) & rs)) {
			gprs[rn] = address;
		}
	};
};

ARMCoreThumb.prototype.constructLDR1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var n = gprs[rn] + immediate;
		gprs[rd] = cpu.mmu.load32(n);
		cpu.mmu.wait32(n);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDR2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load32(gprs[rn] + gprs[rm]);
		cpu.mmu.wait32(gprs[rn] + gprs[rm]);
		++cpu.cycles;
	}
};

ARMCoreThumb.prototype.constructLDR3 = function(rd, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load32((gprs[cpu.PC] & 0xFFFFFFFC) + immediate);
		cpu.mmu.wait32(gprs[cpu.PC]);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDR4 = function(rd, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load32(gprs[cpu.SP] + immediate);
		cpu.mmu.wait32(gprs[cpu.SP] + immediate);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRB1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var n = gprs[rn] + immediate;
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.loadU8(n);
		cpu.mmu.wait(n);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRB2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.loadU8(gprs[rn] + gprs[rm]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRH1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var n = gprs[rn] + immediate;
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.loadU16(n);
		cpu.mmu.wait(n);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRH2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.loadU16(gprs[rn] + gprs[rm]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRSB = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load8(gprs[rn] + gprs[rm]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLDRSH = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load16(gprs[rn] + gprs[rm]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
		++cpu.cycles;
	};
};

ARMCoreThumb.prototype.constructLSL1 = function(rd, rm, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		if (immediate == 0) {
			gprs[rd] = gprs[rm];
		} else {
			cpu.cpsrC = gprs[rm] & (1 << (32 - immediate));
			gprs[rd] = gprs[rm] << immediate;
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructLSL2 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var rs = gprs[rm] & 0xFF;
		if (rs) {
			if (rs < 32) {
				cpu.cpsrC = gprs[rd] & (1 << (32 - rs));
				gprs[rd] <<= rs;
			} else {
				if (rs > 32) {
					cpu.cpsrC = 0;
				} else {
					cpu.cpsrC = gprs[rd] & 0x00000001;
				}
				gprs[rd] = 0;
			}
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructLSR1 = function(rd, rm, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		if (immediate == 0) {
			cpu.cpsrC = gprs[rm] >> 31;
			gprs[rd] = 0;
		} else {
			cpu.cpsrC = gprs[rm] & (1 << (immediate - 1));
			gprs[rd] = gprs[rm] >>> immediate;
		}
		cpu.cpsrN = 0;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
}

ARMCoreThumb.prototype.constructLSR2 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var rs = gprs[rm] & 0xFF;
		if (rs) {
			if (rs < 32) {
				cpu.cpsrC = gprs[rd] & (1 << (rs - 1));
				gprs[rd] >>>= rs;
			} else {
				if (rs > 32) {
					cpu.cpsrC = 0;
				} else {
					cpu.cpsrC = gprs[rd] >> 31;
				}
				gprs[rd] = 0;
			}
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructMOV1 = function(rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rn] = immediate;
		cpu.cpsrN = immediate >> 31;
		cpu.cpsrZ = !(immediate & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructMOV2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = gprs[rn];
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = 0;
		cpu.cpsrV = 0;
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructMOV3 = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[rm];
	};
};

ARMCoreThumb.prototype.constructMUL = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		cpu.mmu.waitMul(gprs[rm]);
		if ((gprs[rm] & 0xFFFF0000) && (gprs[rd] & 0xFFFF0000)) {
			// Our data type is a double--we'll lose bits if we do it all at once!
			var hi = ((gprs[rd] & 0xFFFF0000) * gprs[rm]) & 0xFFFFFFFF;
			var lo = ((gprs[rd] & 0x0000FFFF) * gprs[rm]) & 0xFFFFFFFF;
			gprs[rd] = (hi + lo) & 0xFFFFFFFF;
		} else {
			gprs[rd] *= gprs[rm];
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructMVN = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = ~gprs[rm];
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructNEG = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = -gprs[rm];
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = 0 >= (d >>> 0);
		cpu.cpsrV = (gprs[rm] >> 31) && (d >> 31);
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructORR = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = gprs[rd] | gprs[rm];
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructPOP = function(rs, r) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		++cpu.cycles;
		var address = gprs[cpu.SP];
		var total = 0;
		var m, i;
		for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
			if (rs & m) {
				cpu.mmu.waitSeq32(address);
				gprs[i] = cpu.mmu.load32(address);
				address += 4;
				++total;
			}
		}
		if (r) {
			gprs[cpu.PC] = cpu.mmu.load32(address) & 0xFFFFFFFE;
			address += 4;
			++total;
		}
		cpu.mmu.waitMulti32(address, total);
		gprs[cpu.SP] = address;
	};
};

ARMCoreThumb.prototype.constructPUSH = function(rs, r) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var address = gprs[cpu.SP] - 4;
		var total = 0;
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		if (r) {
			cpu.mmu.store32(address, gprs[cpu.LR]);
			address -= 4;
			++total;
		}
		var m, i;
		for (m = 0x80, i = 7; m; m >>= 1, --i) {
			if (rs & m) {
				cpu.mmu.store32(address, gprs[i]);
				address -= 4;
				++total;
				break;
			}
		}
		for (m >>= 1, --i; m; m >>= 1, --i) {
			if (rs & m) {
				cpu.mmu.store32(address, gprs[i]);
				address -= 4;
				++total;
			}
		}
		cpu.mmu.waitMulti32(address, total);
		gprs[cpu.SP] = address + 4;
	};
};

ARMCoreThumb.prototype.constructROR = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var rs = gprs[rm] & 0xFF;
		if (rs) {
			var r4 = rs & 0x1F;
			if (r4 > 0) {
				cpu.cpsrC = gprs[rd] & (1 << (r4 - 1));
				gprs[rd] = (gprs[rd] >>> r4) | (gprs[rd] << (32 - r4));
			} else {
				cpu.cpsrC = gprs[rd] >> 31;
			}
		}
		cpu.cpsrN = gprs[rd] >> 31;
		cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
	};
};

ARMCoreThumb.prototype.constructSBC = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var m = (gprs[rm] >>> 0) + !cpu.cpsrC;
		var d = (gprs[rd] >>> 0) - m;
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rd] >>> 0) >= (d >>> 0);
		cpu.cpsrV = ((gprs[rd] ^ m) >> 31) && ((gprs[rd] ^ d) >> 31);
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructSTMIA = function(rn, rs) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.wait(gprs[cpu.PC]);
		var address = gprs[rn];
		var total = 0;
		var m, i;
		for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
			if (rs & m) {
				cpu.mmu.store32(address, gprs[i]);
				address += 4;
				++total;
				break;
			}
		}
		for (m <<= 1, ++i; i < 8; m <<= 1, ++i) {
			if (rs & m) {
				cpu.mmu.store32(address, gprs[i]);
				address += 4;
				++total;
			}
		}
		cpu.mmu.waitMulti32(address, total);
		gprs[rn] = address;
	};
};

ARMCoreThumb.prototype.constructSTR1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var n = gprs[rn] + immediate;
		cpu.mmu.store32(n, gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait32(n);
	};
};

ARMCoreThumb.prototype.constructSTR2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.store32(gprs[rn] + gprs[rm], gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait32(gprs[rn] + gprs[rm]);
	};
};

ARMCoreThumb.prototype.constructSTR3 = function(rd, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.store32(gprs[cpu.SP] + immediate, gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait32(gprs[cpu.SP] + immediate);
	};
};

ARMCoreThumb.prototype.constructSTRB1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var n = gprs[rn] + immediate;
		cpu.mmu.store8(n, gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait(n);
	};
};

ARMCoreThumb.prototype.constructSTRB2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.store8(gprs[rn] + gprs[rm], gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
	}
};

ARMCoreThumb.prototype.constructSTRH1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		var n = gprs[rn] + immediate;
		cpu.mmu.store16(n, gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait(n);
	};
};

ARMCoreThumb.prototype.constructSTRH2 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.store16(gprs[rn] + gprs[rm], gprs[rd]);
		cpu.mmu.wait(gprs[cpu.PC]);
		cpu.mmu.wait(gprs[rn] + gprs[rm]);
	}
};

ARMCoreThumb.prototype.constructSUB1 = function(rd, rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = gprs[rn] - immediate;
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
		cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31);
		gprs[rd] = d;
	};
}

ARMCoreThumb.prototype.constructSUB2 = function(rn, immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = gprs[rn] - immediate;
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
		cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31);
		gprs[rn] = d;
	};
};

ARMCoreThumb.prototype.constructSUB3 = function(rd, rn, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var d = gprs[rn] - gprs[rm];
		cpu.cpsrN = d >> 31;
		cpu.cpsrZ = !(d & 0xFFFFFFFF);
		cpu.cpsrC = (gprs[rn] >>> 0) >= (gprs[rm] >>> 0);
		cpu.cpsrV = (gprs[rn] >> 31) != (gprs[rm] >> 31) &&
					(gprs[rn] >> 31) != (d >> 31);
		gprs[rd] = d;
	};
};

ARMCoreThumb.prototype.constructSWI = function(immediate) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.irq.swi(immediate);
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
	}
};

ARMCoreThumb.prototype.constructTST = function(rd, rm) {
	var cpu = this.cpu;
	var gprs = cpu.gprs;
	return function() {
		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		var aluOut = gprs[rd] & gprs[rm];
		cpu.cpsrN = aluOut >> 31;
		cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
	};
};

function MemoryView(memory, offset) {
	this.inherit();
	this.buffer = memory;
	this.view = new DataView(this.buffer, typeof(offset) === "number" ? offset : 0);
	this.mask = memory.byteLength - 1;
	this.resetMask();
};

MemoryView.prototype.resetMask = function() {
	this.mask8 = this.mask & 0xFFFFFFFF;
	this.mask16 = this.mask & 0xFFFFFFFE;
	this.mask32 = this.mask & 0xFFFFFFFC;
};

MemoryView.prototype.load8 = function(offset) {
	return this.view.getInt8(offset & this.mask8);
};

MemoryView.prototype.load16 = function(offset) {
	// Unaligned 16-bit loads are unpredictable...let's just pretend they work
	return this.view.getInt16(offset & this.mask, true);
};

MemoryView.prototype.loadU8 = function(offset) {
	return this.view.getUint8(offset & this.mask8);
};

MemoryView.prototype.loadU16 = function(offset) {
	// Unaligned 16-bit loads are unpredictable...let's just pretend they work
	return this.view.getUint16(offset & this.mask, true);
};

MemoryView.prototype.load32 = function(offset) {
	// Unaligned 32-bit loads are "rotated" so they make some semblance of sense
	var rotate = (offset & 3) << 3;
	var mem = this.view.getInt32(offset & this.mask32, true);
	return (mem >>> rotate) | (mem << (32 - rotate));
};

MemoryView.prototype.store8 = function(offset, value) {
	this.view.setInt8(offset & this.mask8, value);
};

MemoryView.prototype.store16 = function(offset, value) {
	this.view.setInt16(offset & this.mask16, value, true);
};

MemoryView.prototype.store32 = function(offset, value) {
	this.view.setInt32(offset & this.mask32, value, true);
};

MemoryView.prototype.invalidatePage = function(address) {};

MemoryView.prototype.replaceData = function(memory, offset) {
	this.buffer = memory;
	this.view = new DataView(this.buffer, typeof(offset) === "number" ? offset : 0);
	if (this.icache) {
		this.icache = new Array(this.icache.length);
	}
};

function MemoryBlock(size, cacheBits) {
	MemoryView.call(this, new ArrayBuffer(size));
	this.ICACHE_PAGE_BITS = cacheBits;
	this.PAGE_MASK = (2 << this.ICACHE_PAGE_BITS) - 1;
	this.icache = new Array(size >> (this.ICACHE_PAGE_BITS + 1));
};

MemoryBlock.prototype = Object.create(MemoryView.prototype);

MemoryBlock.prototype.invalidatePage = function(address) {
	var page = this.icache[(address & this.mask) >> this.ICACHE_PAGE_BITS];
	if (page) {
		page.invalid = true;
	}
};

function ROMView(rom, offset) {
	MemoryView.call(this, rom, offset);
	this.ICACHE_PAGE_BITS = 10;
	this.PAGE_MASK = (2 << this.ICACHE_PAGE_BITS) - 1;
	this.icache = new Array(rom.byteLength >> (this.ICACHE_PAGE_BITS + 1));
	this.mask = 0x01FFFFFF;
	this.resetMask();
};

ROMView.prototype = Object.create(MemoryView.prototype);

ROMView.prototype.store8 = function(offset, value) {};

ROMView.prototype.store16 = function(offset, value) {
	if (offset < 0xCA && offset >= 0xC4) {
		if (!this.gpio) {
			this.gpio = this.mmu.allocGPIO(this);
		}
		this.gpio.store16(offset, value);
	}
};

ROMView.prototype.store32 = function(offset, value) {
	if (offset < 0xCA && offset >= 0xC4) {
		if (!this.gpio) {
			this.gpio = this.mmu.allocGPIO(this);
		}
		this.gpio.store32(offset, value);
	}
};

function BIOSView(rom, offset) {
	MemoryView.call(this, rom, offset);
	this.ICACHE_PAGE_BITS = 16;
	this.PAGE_MASK = (2 << this.ICACHE_PAGE_BITS) - 1;
	this.icache = new Array(1);
};

BIOSView.prototype = Object.create(MemoryView.prototype);

BIOSView.prototype.load8 = function(offset) {
	if (offset >= this.buffer.byteLength) {
		return -1;
	}
	return this.view.getInt8(offset);
};

BIOSView.prototype.load16 = function(offset) {
	if (offset >= this.buffer.byteLength) {
		return -1;
	}
	return this.view.getInt16(offset, true);
};

BIOSView.prototype.loadU8 = function(offset) {
	if (offset >= this.buffer.byteLength) {
		return -1;
	}
	return this.view.getUint8(offset);
};

BIOSView.prototype.loadU16 = function(offset) {
	if (offset >= this.buffer.byteLength) {
		return -1;
	}
	return this.view.getUint16(offset, true);
};

BIOSView.prototype.load32 = function(offset) {
	if (offset >= this.buffer.byteLength) {
		return -1;
	}
	return this.view.getInt32(offset, true);
};

BIOSView.prototype.store8 = function(offset, value) {};

BIOSView.prototype.store16 = function(offset, value) {};

BIOSView.prototype.store32 = function(offset, value) {};

function BadMemory(mmu, cpu) {
	this.inherit();
	this.cpu = cpu;
	this.mmu = mmu
};

BadMemory.prototype.load8 = function(offset) {
	return this.mmu.load8(this.cpu.gprs[this.cpu.PC] - this.cpu.instructionWidth + (offset & 0x3));
};

BadMemory.prototype.load16 = function(offset) {
	return this.mmu.load16(this.cpu.gprs[this.cpu.PC] - this.cpu.instructionWidth + (offset & 0x2));
};

BadMemory.prototype.loadU8 = function(offset) {
	return this.mmu.loadU8(this.cpu.gprs[this.cpu.PC] - this.cpu.instructionWidth + (offset & 0x3));
};

BadMemory.prototype.loadU16 = function(offset) {
	return this.mmu.loadU16(this.cpu.gprs[this.cpu.PC] - this.cpu.instructionWidth + (offset & 0x2));
};

BadMemory.prototype.load32 = function(offset) {
	if (this.cpu.execMode == this.cpu.MODE_ARM) {
		return this.mmu.load32(this.cpu.gprs[this.cpu.gprs.PC] - this.cpu.instructionWidth);
	} else {
		var halfword = this.mmu.loadU16(this.cpu.gprs[this.cpu.PC] - this.cpu.instructionWidth);
		return halfword | (halfword << 16);
	}
};

BadMemory.prototype.store8 = function(offset, value) {};

BadMemory.prototype.store16 = function(offset, value) {};

BadMemory.prototype.store32 = function(offset, value) {};

BadMemory.prototype.invalidatePage = function(address) {};

function GameBoyAdvanceMMU() {
	this.inherit();
	this.REGION_BIOS = 0x0;
	this.REGION_WORKING_RAM = 0x2;
	this.REGION_WORKING_IRAM = 0x3;
	this.REGION_IO = 0x4;
	this.REGION_PALETTE_RAM = 0x5;
	this.REGION_VRAM = 0x6;
	this.REGION_OAM = 0x7;
	this.REGION_CART0 = 0x8;
	this.REGION_CART1 = 0xA;
	this.REGION_CART2 = 0xC;
	this.REGION_CART_SRAM = 0xE;

	this.BASE_BIOS = 0x00000000;
	this.BASE_WORKING_RAM = 0x02000000;
	this.BASE_WORKING_IRAM = 0x03000000;
	this.BASE_IO = 0x04000000;
	this.BASE_PALETTE_RAM = 0x05000000;
	this.BASE_VRAM = 0x06000000;
	this.BASE_OAM = 0x07000000;
	this.BASE_CART0 = 0x08000000;
	this.BASE_CART1 = 0x0A000000;
	this.BASE_CART2 = 0x0C000000;
	this.BASE_CART_SRAM = 0x0E000000;

	this.BASE_MASK = 0x0F000000;
	this.BASE_OFFSET = 24;
	this.OFFSET_MASK = 0x00FFFFFF;

	this.SIZE_BIOS = 0x00004000;
	this.SIZE_WORKING_RAM = 0x00040000;
	this.SIZE_WORKING_IRAM = 0x00008000;
	this.SIZE_IO = 0x00000400;
	this.SIZE_PALETTE_RAM = 0x00000400;
	this.SIZE_VRAM = 0x00018000;
	this.SIZE_OAM = 0x00000400;
	this.SIZE_CART0 = 0x02000000;
	this.SIZE_CART1 = 0x02000000;
	this.SIZE_CART2 = 0x02000000;
	this.SIZE_CART_SRAM = 0x00008000;
	this.SIZE_CART_FLASH512 = 0x00010000;
	this.SIZE_CART_FLASH1M = 0x00020000;
	this.SIZE_CART_EEPROM = 0x00002000;

	this.DMA_TIMING_NOW = 0;
	this.DMA_TIMING_VBLANK = 1;
	this.DMA_TIMING_HBLANK = 2;
	this.DMA_TIMING_CUSTOM = 3;

	this.DMA_INCREMENT = 0;
	this.DMA_DECREMENT = 1;
	this.DMA_FIXED = 2;
	this.DMA_INCREMENT_RELOAD = 3;

	this.DMA_OFFSET = [ 1, -1, 0, 1 ];

	this.WAITSTATES = [ 0, 0, 2, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4 ];
	this.WAITSTATES_32 = [ 0, 0, 5, 0, 0, 1, 0, 1, 7, 7, 9, 9, 13, 13, 8 ];
	this.WAITSTATES_SEQ = [ 0, 0, 2, 0, 0, 0, 0, 0, 2, 2, 4, 4, 8, 8, 4 ];
	this.WAITSTATES_SEQ_32 = [ 0, 0, 5, 0, 0, 1, 0, 1, 5, 5, 9, 9, 17, 17, 8 ];
	this.NULLWAIT = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];

	for (var i = 15; i < 256; ++i) {
		this.WAITSTATES[i] = 0;
		this.WAITSTATES_32[i] = 0;
		this.WAITSTATES_SEQ[i] = 0;
		this.WAITSTATES_SEQ_32[i] = 0;
		this.NULLWAIT[i] = 0;
	}

	this.ROM_WS = [ 4, 3, 2, 8 ];
	this.ROM_WS_SEQ = [
		[ 2, 1 ],
		[ 4, 1 ],
		[ 8, 1 ]
	];

	this.ICACHE_PAGE_BITS = 8;
	this.PAGE_MASK = (2 << this.ICACHE_PAGE_BITS) - 1;

	this.bios = null;
};

GameBoyAdvanceMMU.prototype.mmap = function(region, object) {
	this.memory[region] = object;
}

GameBoyAdvanceMMU.prototype.clear = function() {
	this.badMemory = new BadMemory(this, this.cpu);
	this.memory = [
		this.bios,
		this.badMemory, // Unused
		new MemoryBlock(this.SIZE_WORKING_RAM, 9),
		new MemoryBlock(this.SIZE_WORKING_IRAM, 7),
		null, // This is owned by GameBoyAdvanceIO
		null, // This is owned by GameBoyAdvancePalette
		null, // This is owned by GameBoyAdvanceVRAM
		null, // This is owned by GameBoyAdvanceOAM
		this.badMemory,
		this.badMemory,
		this.badMemory,
		this.badMemory,
		this.badMemory,
		this.badMemory,
		this.badMemory,
		this.badMemory // Unused
	];
	for (var i = 16; i < 256; ++i) {
		this.memory[i] = this.badMemory;
	}

	this.waitstates = this.WAITSTATES.slice(0);
	this.waitstatesSeq = this.WAITSTATES_SEQ.slice(0);
	this.waitstates32 = this.WAITSTATES_32.slice(0);
	this.waitstatesSeq32 = this.WAITSTATES_SEQ_32.slice(0);
	this.waitstatesPrefetch = this.WAITSTATES_SEQ.slice(0);
	this.waitstatesPrefetch32 = this.WAITSTATES_SEQ_32.slice(0);

	this.cart = null;
	this.save = null;

	this.DMA_REGISTER = [
		this.core.io.DMA0CNT_HI >> 1,
		this.core.io.DMA1CNT_HI >> 1,
		this.core.io.DMA2CNT_HI >> 1,
		this.core.io.DMA3CNT_HI >> 1
	];
};

GameBoyAdvanceMMU.prototype.freeze = function() {
	return {
		'ram': Serializer.prefix(this.memory[this.REGION_WORKING_RAM].buffer),
		'iram': Serializer.prefix(this.memory[this.REGION_WORKING_IRAM].buffer),
	};
};

GameBoyAdvanceMMU.prototype.defrost = function(frost) {
	this.memory[this.REGION_WORKING_RAM].replaceData(frost.ram);
	this.memory[this.REGION_WORKING_IRAM].replaceData(frost.iram);
};

GameBoyAdvanceMMU.prototype.loadBios = function(bios, real) {
	this.bios = new BIOSView(bios);
	this.bios.real = !!real;
};

GameBoyAdvanceMMU.prototype.loadRom = function(rom, process) {
	var cart = {
		title: null,
		code: null,
		maker: null,
		memory: rom,
		saveType: null,
	};

	var lo = new ROMView(rom);
	if (lo.view.getUint8(0xB2) != 0x96) {
		// Not a valid ROM
		return null;
	}
	lo.mmu = this; // Needed for GPIO
	this.memory[this.REGION_CART0] = lo;
	this.memory[this.REGION_CART1] = lo;
	this.memory[this.REGION_CART2] = lo;

	if (rom.byteLength > 0x01000000) {
		var hi = new ROMView(rom, 0x01000000);
		this.memory[this.REGION_CART0 + 1] = hi;
		this.memory[this.REGION_CART1 + 1] = hi;
		this.memory[this.REGION_CART2 + 1] = hi;
	}

	if (process) {
		var name = '';
		for (var i = 0; i < 12; ++i) {
			var c = lo.loadU8(i + 0xA0);
			if (!c) {
				break;
			}
			name += String.fromCharCode(c);
		}
		cart.title = name;

		var code = '';
		for (var i = 0; i < 4; ++i) {
			var c = lo.loadU8(i + 0xAC);
			if (!c) {
				break;
			}
			code += String.fromCharCode(c);
		}
		cart.code = code;

		var maker = '';
		for (var i = 0; i < 2; ++i) {
			var c = lo.loadU8(i + 0xB0);
			if (!c) {
				break;
			}
			maker += String.fromCharCode(c);
		}
		cart.maker = maker;

		// Find savedata type
		var state = '';
		var next;
		var terminal = false;
		for (var i = 0xE4; i < rom.byteLength && !terminal; ++i) {
			next = String.fromCharCode(lo.loadU8(i));
			state += next;
			switch (state) {
			case 'F':
			case 'FL':
			case 'FLA':
			case 'FLAS':
			case 'FLASH':
			case 'FLASH_':
			case 'FLASH5':
			case 'FLASH51':
			case 'FLASH512':
			case 'FLASH512_':
			case 'FLASH1':
			case 'FLASH1M':
			case 'FLASH1M_':
			case 'S':
			case 'SR':
			case 'SRA':
			case 'SRAM':
			case 'SRAM_':
			case 'E':
			case 'EE':
			case 'EEP':
			case 'EEPR':
			case 'EEPRO':
			case 'EEPROM':
			case 'EEPROM_':
				break;
			case 'FLASH_V':
			case 'FLASH512_V':
			case 'FLASH1M_V':
			case 'SRAM_V':
			case 'EEPROM_V':
				terminal = true;
				break;
			default:
				state = next;
				break;
			}
		}
		if (terminal) {
			cart.saveType = state;
			switch (state) {
			case 'FLASH_V':
			case 'FLASH512_V':
				this.save = this.memory[this.REGION_CART_SRAM] = new FlashSavedata(this.SIZE_CART_FLASH512);
				break;
			case 'FLASH1M_V':
				this.save = this.memory[this.REGION_CART_SRAM] = new FlashSavedata(this.SIZE_CART_FLASH1M);
				break;
			case 'SRAM_V':
				this.save = this.memory[this.REGION_CART_SRAM] = new SRAMSavedata(this.SIZE_CART_SRAM);
				break;
			case 'EEPROM_V':
				this.save = this.memory[this.REGION_CART2 + 1] = new EEPROMSavedata(this.SIZE_CART_EEPROM, this);
				break;
			}
		}
		if (!this.save) {
			// Assume we have SRAM
			this.save = this.memory[this.REGION_CART_SRAM] = new SRAMSavedata(this.SIZE_CART_SRAM);
		}
	}

	this.cart = cart;
	return cart;
};

GameBoyAdvanceMMU.prototype.loadSavedata = function(save) {
	this.save.replaceData(save);
};

GameBoyAdvanceMMU.prototype.load8 = function(offset) {
	return this.memory[offset >>> this.BASE_OFFSET].load8(offset & 0x00FFFFFF);
};

GameBoyAdvanceMMU.prototype.load16 = function(offset) {
	return this.memory[offset >>> this.BASE_OFFSET].load16(offset & 0x00FFFFFF);
};

GameBoyAdvanceMMU.prototype.load32 = function(offset) {
	return this.memory[offset >>> this.BASE_OFFSET].load32(offset & 0x00FFFFFF);
};

GameBoyAdvanceMMU.prototype.loadU8 = function(offset) {
	return this.memory[offset >>> this.BASE_OFFSET].loadU8(offset & 0x00FFFFFF);
};

GameBoyAdvanceMMU.prototype.loadU16 = function(offset) {
	return this.memory[offset >>> this.BASE_OFFSET].loadU16(offset & 0x00FFFFFF);
};

GameBoyAdvanceMMU.prototype.store8 = function(offset, value) {
	var maskedOffset = offset & 0x00FFFFFF;
	var memory = this.memory[offset >>> this.BASE_OFFSET];
	memory.store8(maskedOffset, value);
	memory.invalidatePage(maskedOffset);
};

GameBoyAdvanceMMU.prototype.store16 = function(offset, value) {
	var maskedOffset = offset & 0x00FFFFFE;
	var memory = this.memory[offset >>> this.BASE_OFFSET];
	memory.store16(maskedOffset, value);
	memory.invalidatePage(maskedOffset);
};

GameBoyAdvanceMMU.prototype.store32 = function(offset, value) {
	var maskedOffset = offset & 0x00FFFFFC;
	var memory = this.memory[offset >>> this.BASE_OFFSET];
	memory.store32(maskedOffset, value);
	memory.invalidatePage(maskedOffset);
	memory.invalidatePage(maskedOffset + 2);
};

GameBoyAdvanceMMU.prototype.waitPrefetch = function(memory) {
	this.cpu.cycles += 1 + this.waitstatesPrefetch[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.waitPrefetch32 = function(memory) {
	this.cpu.cycles += 1 + this.waitstatesPrefetch32[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.wait = function(memory) {
	this.cpu.cycles += 1 + this.waitstates[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.wait32 = function(memory) {
	this.cpu.cycles += 1 + this.waitstates32[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.waitSeq = function(memory) {
	this.cpu.cycles += 1 + this.waitstatesSeq[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.waitSeq32 = function(memory) {
	this.cpu.cycles += 1 + this.waitstatesSeq32[memory >>> this.BASE_OFFSET];
};

GameBoyAdvanceMMU.prototype.waitMul = function(rs) {
	if ((rs & 0xFFFFFF00 == 0xFFFFFF00) || !(rs & 0xFFFFFF00)) {
		this.cpu.cycles += 1;
	} else if ((rs & 0xFFFF0000 == 0xFFFF0000) || !(rs & 0xFFFF0000)) {
		this.cpu.cycles += 2;
	} else if ((rs & 0xFF000000 == 0xFF000000) || !(rs & 0xFF000000)) {
		this.cpu.cycles += 3;
	} else {
		this.cpu.cycles += 4;
	}
}

GameBoyAdvanceMMU.prototype.waitMulti32 = function(memory, seq) {
	this.cpu.cycles += 1 + this.waitstates32[memory >>> this.BASE_OFFSET];
	this.cpu.cycles += (1 + this.waitstatesSeq32[memory >>> this.BASE_OFFSET]) * (seq - 1);
};

GameBoyAdvanceMMU.prototype.addressToPage = function(region, address) {
	return address >> this.memory[region].ICACHE_PAGE_BITS;
};

GameBoyAdvanceMMU.prototype.accessPage = function(region, pageId) {
	var memory = this.memory[region];
	var page = memory.icache[pageId];
	if (!page || page.invalid) {
		page = {
			thumb: new Array(1 << (memory.ICACHE_PAGE_BITS)),
			arm: new Array(1 << memory.ICACHE_PAGE_BITS - 1),
			invalid: false
		}
		memory.icache[pageId] = page;
	}
	return page;
};

GameBoyAdvanceMMU.prototype.scheduleDma = function(number, info) {
	switch (info.timing) {
	case this.DMA_TIMING_NOW:
		this.serviceDma(number, info);
		break;
	case this.DMA_TIMING_HBLANK:
		// Handled implicitly
		break;
	case this.DMA_TIMING_VBLANK:
		// Handled implicitly
		break;
	case this.DMA_TIMING_CUSTOM:
		switch (number) {
		case 0:
			this.core.WARN('Discarding invalid DMA0 scheduling');
			break;
		case 1:
		case 2:
			this.cpu.irq.audio.scheduleFIFODma(number, info);
			break;
		case 3:
			this.cpu.irq.video.scheduleVCaptureDma(dma, info);
			break;
		}
	}
};

GameBoyAdvanceMMU.prototype.runHblankDmas = function() {
	var dma;
	for (var i = 0; i < this.cpu.irq.dma.length; ++i) {
		dma = this.cpu.irq.dma[i];
		if (dma.enable && dma.timing == this.DMA_TIMING_HBLANK) {
			this.serviceDma(i, dma);
		}
	}
};

GameBoyAdvanceMMU.prototype.runVblankDmas = function() {
	var dma;
	for (var i = 0; i < this.cpu.irq.dma.length; ++i) {
		dma = this.cpu.irq.dma[i];
		if (dma.enable && dma.timing == this.DMA_TIMING_VBLANK) {
			this.serviceDma(i, dma);
		}
	}
};

GameBoyAdvanceMMU.prototype.serviceDma = function(number, info) {
	if (!info.enable) {
		// There was a DMA scheduled that got canceled
		return;
	}

	var width = info.width;
	var sourceOffset = this.DMA_OFFSET[info.srcControl] * width;
	var destOffset = this.DMA_OFFSET[info.dstControl] * width;
	var wordsRemaining = info.nextCount;
	var source = info.nextSource & this.OFFSET_MASK;
	var dest = info.nextDest & this.OFFSET_MASK;
	var sourceRegion = info.nextSource >>> this.BASE_OFFSET;
	var destRegion = info.nextDest >>> this.BASE_OFFSET;
	var sourceBlock = this.memory[sourceRegion];
	var destBlock = this.memory[destRegion];
	var sourceView = null;
	var destView = null;
	var sourceMask = 0xFFFFFFFF;
	var destMask = 0xFFFFFFFF;
	var word;

	if (destBlock.ICACHE_PAGE_BITS) {
		var endPage = (dest + wordsRemaining * width) >> destBlock.ICACHE_PAGE_BITS;
		for (var i = dest >> destBlock.ICACHE_PAGE_BITS; i <= endPage; ++i) {
			destBlock.invalidatePage(i << destBlock.ICACHE_PAGE_BITS);
		}
	}

	if (destRegion == this.REGION_WORKING_RAM || destRegion == this.REGION_WORKING_IRAM) {
		destView = destBlock.view;
		destMask = destBlock.mask;
	}

	if (sourceRegion == this.REGION_WORKING_RAM || sourceRegion == this.REGION_WORKING_IRAM || sourceRegion == this.REGION_CART0 || sourceRegion == this.REGION_CART1) {
		sourceView = sourceBlock.view;
		sourceMask = sourceBlock.mask;
	}

	if (sourceBlock && destBlock) {
		if (sourceView && destView) {
			if (width == 4) {
				source &= 0xFFFFFFFC;
				dest &= 0xFFFFFFFC;
				while (wordsRemaining--) {
					word = sourceView.getInt32(source & sourceMask);
					destView.setInt32(dest & destMask, word);
					source += sourceOffset;
					dest += destOffset;
				}
			} else {
				while (wordsRemaining--) {
					word = sourceView.getUint16(source & sourceMask);
					destView.setUint16(dest & destMask, word);
					source += sourceOffset;
					dest += destOffset;
				}
			}
		} else if (sourceView) {
			if (width == 4) {
				source &= 0xFFFFFFFC;
				dest &= 0xFFFFFFFC;
				while (wordsRemaining--) {
					word = sourceView.getInt32(source & sourceMask, true);
					destBlock.store32(dest, word);
					source += sourceOffset;
					dest += destOffset;
				}
			} else {
				while (wordsRemaining--) {
					word = sourceView.getUint16(source & sourceMask, true);
					destBlock.store16(dest, word);
					source += sourceOffset;
					dest += destOffset;
				}
			}
		} else {
			if (width == 4) {
				source &= 0xFFFFFFFC;
				dest &= 0xFFFFFFFC;
				while (wordsRemaining--) {
					word = sourceBlock.load32(source);
					destBlock.store32(dest, word);
					source += sourceOffset;
					dest += destOffset;
				}
			} else {
				while (wordsRemaining--) {
					word = sourceBlock.loadU16(source);
					destBlock.store16(dest, word);
					source += sourceOffset;
					dest += destOffset;
				}
			}
		}
	} else {
		this.core.WARN('Invalid DMA');
	}

	if (info.doIrq) {
		info.nextIRQ = this.cpu.cycles + 2;
		info.nextIRQ += (width == 4 ? this.waitstates32[sourceRegion] + this.waitstates32[destRegion]
		                            : this.waitstates[sourceRegion] + this.waitstates[destRegion]);
		info.nextIRQ += (info.count - 1) * (width == 4 ? this.waitstatesSeq32[sourceRegion] + this.waitstatesSeq32[destRegion]
		                                               : this.waitstatesSeq[sourceRegion] + this.waitstatesSeq[destRegion]);
	}

	info.nextSource = source | (sourceRegion << this.BASE_OFFSET);
	info.nextDest = dest | (destRegion << this.BASE_OFFSET);
	info.nextCount = wordsRemaining;

	if (!info.repeat) {
		info.enable = false;

		// Clear the enable bit in memory
		var io = this.memory[this.REGION_IO];
		io.registers[this.DMA_REGISTER[number]] &= 0x7FE0;
	} else {
		info.nextCount = info.count;
		if (info.dstControl == this.DMA_INCREMENT_RELOAD) {
			info.nextDest = info.dest;
		}
		this.scheduleDma(number, info);
	}
};

GameBoyAdvanceMMU.prototype.adjustTimings = function(word) {
	var sram = word & 0x0003;
	var ws0 = (word & 0x000C) >> 2;
	var ws0seq = (word & 0x0010) >> 4;
	var ws1 = (word & 0x0060) >> 5;
	var ws1seq = (word & 0x0080) >> 7;
	var ws2 = (word & 0x0300) >> 8;
	var ws2seq = (word & 0x0400) >> 10;
	var prefetch = word & 0x4000;

	this.waitstates[this.REGION_CART_SRAM] = this.ROM_WS[sram];
	this.waitstatesSeq[this.REGION_CART_SRAM] = this.ROM_WS[sram];
	this.waitstates32[this.REGION_CART_SRAM] = this.ROM_WS[sram];
	this.waitstatesSeq32[this.REGION_CART_SRAM] = this.ROM_WS[sram];

	this.waitstates[this.REGION_CART0] = this.waitstates[this.REGION_CART0 + 1] = this.ROM_WS[ws0];
	this.waitstates[this.REGION_CART1] = this.waitstates[this.REGION_CART1 + 1] = this.ROM_WS[ws1];
	this.waitstates[this.REGION_CART2] = this.waitstates[this.REGION_CART2 + 1] = this.ROM_WS[ws2];

	this.waitstatesSeq[this.REGION_CART0] = this.waitstatesSeq[this.REGION_CART0 + 1] = this.ROM_WS_SEQ[0][ws0seq];
	this.waitstatesSeq[this.REGION_CART1] = this.waitstatesSeq[this.REGION_CART1 + 1] = this.ROM_WS_SEQ[1][ws1seq];
	this.waitstatesSeq[this.REGION_CART2] = this.waitstatesSeq[this.REGION_CART2 + 1] = this.ROM_WS_SEQ[2][ws2seq];

	this.waitstates32[this.REGION_CART0] = this.waitstates32[this.REGION_CART0 + 1] = this.waitstates[this.REGION_CART0] + 1 + this.waitstatesSeq[this.REGION_CART0];
	this.waitstates32[this.REGION_CART1] = this.waitstates32[this.REGION_CART1 + 1] = this.waitstates[this.REGION_CART1] + 1 + this.waitstatesSeq[this.REGION_CART1];
	this.waitstates32[this.REGION_CART2] = this.waitstates32[this.REGION_CART2 + 1] = this.waitstates[this.REGION_CART2] + 1 + this.waitstatesSeq[this.REGION_CART2];

	this.waitstatesSeq32[this.REGION_CART0] = this.waitstatesSeq32[this.REGION_CART0 + 1] = 2 * this.waitstatesSeq[this.REGION_CART0] + 1;
	this.waitstatesSeq32[this.REGION_CART1] = this.waitstatesSeq32[this.REGION_CART1 + 1] = 2 * this.waitstatesSeq[this.REGION_CART1] + 1;
	this.waitstatesSeq32[this.REGION_CART2] = this.waitstatesSeq32[this.REGION_CART2 + 1] = 2 * this.waitstatesSeq[this.REGION_CART2] + 1;

	if (prefetch) {
		this.waitstatesPrefetch[this.REGION_CART0] = this.waitstatesPrefetch[this.REGION_CART0 + 1] = 0;
		this.waitstatesPrefetch[this.REGION_CART1] = this.waitstatesPrefetch[this.REGION_CART1 + 1] = 0;
		this.waitstatesPrefetch[this.REGION_CART2] = this.waitstatesPrefetch[this.REGION_CART2 + 1] = 0;

		this.waitstatesPrefetch32[this.REGION_CART0] = this.waitstatesPrefetch32[this.REGION_CART0 + 1] = 0;
		this.waitstatesPrefetch32[this.REGION_CART1] = this.waitstatesPrefetch32[this.REGION_CART1 + 1] = 0;
		this.waitstatesPrefetch32[this.REGION_CART2] = this.waitstatesPrefetch32[this.REGION_CART2 + 1] = 0;
	} else {
		this.waitstatesPrefetch[this.REGION_CART0] = this.waitstatesPrefetch[this.REGION_CART0 + 1] = this.waitstatesSeq[this.REGION_CART0];
		this.waitstatesPrefetch[this.REGION_CART1] = this.waitstatesPrefetch[this.REGION_CART1 + 1] = this.waitstatesSeq[this.REGION_CART1];
		this.waitstatesPrefetch[this.REGION_CART2] = this.waitstatesPrefetch[this.REGION_CART2 + 1] = this.waitstatesSeq[this.REGION_CART2];

		this.waitstatesPrefetch32[this.REGION_CART0] = this.waitstatesPrefetch32[this.REGION_CART0 + 1] = this.waitstatesSeq32[this.REGION_CART0];
		this.waitstatesPrefetch32[this.REGION_CART1] = this.waitstatesPrefetch32[this.REGION_CART1 + 1] = this.waitstatesSeq32[this.REGION_CART1];
		this.waitstatesPrefetch32[this.REGION_CART2] = this.waitstatesPrefetch32[this.REGION_CART2 + 1] = this.waitstatesSeq32[this.REGION_CART2];
	}
};

GameBoyAdvanceMMU.prototype.saveNeedsFlush = function() {
	return this.save.writePending;
};

GameBoyAdvanceMMU.prototype.flushSave = function() {
	this.save.writePending = false;
};

GameBoyAdvanceMMU.prototype.allocGPIO = function(rom) {
	return new GameBoyAdvanceGPIO(this.core, rom);
};

function GameBoyAdvanceIO() {
	// Video
	this.DISPCNT = 0x000;
	this.GREENSWP = 0x002;
	this.DISPSTAT = 0x004;
	this.VCOUNT = 0x006;
	this.BG0CNT = 0x008;
	this.BG1CNT = 0x00A;
	this.BG2CNT = 0x00C;
	this.BG3CNT = 0x00E;
	this.BG0HOFS = 0x010;
	this.BG0VOFS = 0x012;
	this.BG1HOFS = 0x014;
	this.BG1VOFS = 0x016;
	this.BG2HOFS = 0x018;
	this.BG2VOFS = 0x01A;
	this.BG3HOFS = 0x01C;
	this.BG3VOFS = 0x01E;
	this.BG2PA = 0x020;
	this.BG2PB = 0x022;
	this.BG2PC = 0x024;
	this.BG2PD = 0x026;
	this.BG2X_LO = 0x028;
	this.BG2X_HI = 0x02A;
	this.BG2Y_LO = 0x02C;
	this.BG2Y_HI = 0x02E;
	this.BG3PA = 0x030;
	this.BG3PB = 0x032;
	this.BG3PC = 0x034;
	this.BG3PD = 0x036;
	this.BG3X_LO = 0x038;
	this.BG3X_HI = 0x03A;
	this.BG3Y_LO = 0x03C;
	this.BG3Y_HI = 0x03E;
	this.WIN0H = 0x040;
	this.WIN1H = 0x042;
	this.WIN0V = 0x044;
	this.WIN1V = 0x046;
	this.WININ = 0x048;
	this.WINOUT = 0x04A;
	this.MOSAIC = 0x04C;
	this.BLDCNT = 0x050;
	this.BLDALPHA = 0x052;
	this.BLDY = 0x054;

	// Sound
	this.SOUND1CNT_LO = 0x060;
	this.SOUND1CNT_HI = 0x062;
	this.SOUND1CNT_X = 0x064;
	this.SOUND2CNT_LO = 0x068;
	this.SOUND2CNT_HI = 0x06C;
	this.SOUND3CNT_LO = 0x070;
	this.SOUND3CNT_HI = 0x072;
	this.SOUND3CNT_X = 0x074;
	this.SOUND4CNT_LO = 0x078;
	this.SOUND4CNT_HI = 0x07C;
	this.SOUNDCNT_LO = 0x080;
	this.SOUNDCNT_HI = 0x082;
	this.SOUNDCNT_X = 0x084;
	this.SOUNDBIAS = 0x088;
	this.WAVE_RAM0_LO = 0x090;
	this.WAVE_RAM0_HI = 0x092;
	this.WAVE_RAM1_LO = 0x094;
	this.WAVE_RAM1_HI = 0x096;
	this.WAVE_RAM2_LO = 0x098;
	this.WAVE_RAM2_HI = 0x09A;
	this.WAVE_RAM3_LO = 0x09C;
	this.WAVE_RAM3_HI = 0x09E;
	this.FIFO_A_LO = 0x0A0;
	this.FIFO_A_HI = 0x0A2;
	this.FIFO_B_LO = 0x0A4;
	this.FIFO_B_HI = 0x0A6;

	// DMA
	this.DMA0SAD_LO = 0x0B0;
	this.DMA0SAD_HI = 0x0B2;
	this.DMA0DAD_LO = 0x0B4;
	this.DMA0DAD_HI = 0x0B6;
	this.DMA0CNT_LO = 0x0B8;
	this.DMA0CNT_HI = 0x0BA;
	this.DMA1SAD_LO = 0x0BC;
	this.DMA1SAD_HI = 0x0BE;
	this.DMA1DAD_LO = 0x0C0;
	this.DMA1DAD_HI = 0x0C2;
	this.DMA1CNT_LO = 0x0C4;
	this.DMA1CNT_HI = 0x0C6;
	this.DMA2SAD_LO = 0x0C8;
	this.DMA2SAD_HI = 0x0CA;
	this.DMA2DAD_LO = 0x0CC;
	this.DMA2DAD_HI = 0x0CE;
	this.DMA2CNT_LO = 0x0D0;
	this.DMA2CNT_HI = 0x0D2;
	this.DMA3SAD_LO = 0x0D4;
	this.DMA3SAD_HI = 0x0D6;
	this.DMA3DAD_LO = 0x0D8;
	this.DMA3DAD_HI = 0x0DA;
	this.DMA3CNT_LO = 0x0DC;
	this.DMA3CNT_HI = 0x0DE;

	// Timers
	this.TM0CNT_LO = 0x100;
	this.TM0CNT_HI = 0x102;
	this.TM1CNT_LO = 0x104;
	this.TM1CNT_HI = 0x106;
	this.TM2CNT_LO = 0x108;
	this.TM2CNT_HI = 0x10A;
	this.TM3CNT_LO = 0x10C;
	this.TM3CNT_HI = 0x10E;

	// SIO (note: some of these are repeated)
	this.SIODATA32_LO = 0x120;
	this.SIOMULTI0 = 0x120;
	this.SIODATA32_HI = 0x122;
	this.SIOMULTI1 = 0x122;
	this.SIOMULTI2 = 0x124;
	this.SIOMULTI3 = 0x126;
	this.SIOCNT = 0x128;
	this.SIOMLT_SEND = 0x12A;
	this.SIODATA8 = 0x12A;
	this.RCNT = 0x134;
	this.JOYCNT = 0x140;
	this.JOY_RECV = 0x150;
	this.JOY_TRANS = 0x154;
	this.JOYSTAT = 0x158;

	// Keypad
	this.KEYINPUT = 0x130;
	this.KEYCNT = 0x132;

	// Interrupts, etc
	this.IE = 0x200;
	this.IF = 0x202;
	this.WAITCNT = 0x204;
	this.IME = 0x208;

	this.POSTFLG = 0x300;
	this.HALTCNT = 0x301;

	this.DEFAULT_DISPCNT = 0x0080;
	this.DEFAULT_SOUNDBIAS = 0x200;
	this.DEFAULT_BGPA = 1;
	this.DEFAULT_BGPD = 1;
	this.DEFAULT_RCNT = 0x8000;
};

GameBoyAdvanceIO.prototype.clear = function() {
	this.registers = new Uint16Array(this.cpu.mmu.SIZE_IO);

	this.registers[this.DISPCNT >> 1] = this.DEFAULT_DISPCNT;
	this.registers[this.SOUNDBIAS >> 1] = this.DEFAULT_SOUNDBIAS;
	this.registers[this.BG2PA >> 1] = this.DEFAULT_BGPA;
	this.registers[this.BG2PD >> 1] = this.DEFAULT_BGPD;
	this.registers[this.BG3PA >> 1] = this.DEFAULT_BGPA;
	this.registers[this.BG3PD >> 1] = this.DEFAULT_BGPD;
	this.registers[this.RCNT >> 1] = this.DEFAULT_RCNT;
};

GameBoyAdvanceIO.prototype.freeze = function() {
	return {
		'registers': Serializer.prefix(this.registers.buffer)
	};
};

GameBoyAdvanceIO.prototype.defrost = function(frost) {
	this.registers = new Uint16Array(frost.registers);
	// Video registers don't serialize themselves
	for (var i = 0; i <= this.BLDY; i += 2) {
		this.store16(this.registers[i >> 1]);
	}
};

GameBoyAdvanceIO.prototype.load8 = function(offset) {
	throw 'Unimplmeneted unaligned I/O access';
}

GameBoyAdvanceIO.prototype.load16 = function(offset) {
	return (this.loadU16(offset) << 16) >> 16;
}

GameBoyAdvanceIO.prototype.load32 = function(offset) {
	offset &= 0xFFFFFFFC;
	switch (offset) {
	case this.DMA0CNT_LO:
	case this.DMA1CNT_LO:
	case this.DMA2CNT_LO:
	case this.DMA3CNT_LO:
		return this.loadU16(offset | 2) << 16;
	case this.IME:
		return this.loadU16(offset) & 0xFFFF;
	case this.JOY_RECV:
	case this.JOY_TRANS:
 		this.core.STUB('Unimplemented JOY register read: 0x' + offset.toString(16));
 		return 0;
	}

	return this.loadU16(offset) | (this.loadU16(offset | 2) << 16);
};

GameBoyAdvanceIO.prototype.loadU8 = function(offset) {
	var odd = offset & 0x0001;
	var value = this.loadU16(offset & 0xFFFE);
	return (value >>> (odd << 3)) & 0xFF;
}

GameBoyAdvanceIO.prototype.loadU16 = function(offset) {
	switch (offset) {
	case this.DISPCNT:
	case this.BG0CNT:
	case this.BG1CNT:
	case this.BG2CNT:
	case this.BG3CNT:
	case this.WININ:
	case this.WINOUT:
	case this.SOUND1CNT_LO:
	case this.SOUND3CNT_LO:
	case this.SOUNDCNT_LO:
	case this.SOUNDCNT_HI:
	case this.SOUNDBIAS:
	case this.BLDCNT:
	case this.BLDALPHA:

	case this.TM0CNT_HI:
	case this.TM1CNT_HI:
	case this.TM2CNT_HI:
	case this.TM3CNT_HI:
	case this.DMA0CNT_HI:
	case this.DMA1CNT_HI:
	case this.DMA2CNT_HI:
	case this.DMA3CNT_HI:
	case this.RCNT:
	case this.WAITCNT:
	case this.IE:
	case this.IF:
	case this.IME:
	case this.POSTFLG:
		// Handled transparently by the written registers
		break;

	// Video
	case this.DISPSTAT:
		return this.registers[offset >> 1] | this.video.readDisplayStat();
	case this.VCOUNT:
		return this.video.vcount;

	// Sound
	case this.SOUND1CNT_HI:
	case this.SOUND2CNT_LO:
		return this.registers[offset >> 1] & 0xFFC0;
	case this.SOUND1CNT_X:
	case this.SOUND2CNT_HI:
	case this.SOUND3CNT_X:
		return this.registers[offset >> 1] & 0x4000;
	case this.SOUND3CNT_HI:
		return this.registers[offset >> 1] & 0xE000;
	case this.SOUND4CNT_LO:
		return this.registers[offset >> 1] & 0xFF00;
	case this.SOUND4CNT_HI:
		return this.registers[offset >> 1] & 0x40FF;
	case this.SOUNDCNT_X:
		this.core.STUB('Unimplemented sound register read: SOUNDCNT_X');
		return this.registers[offset >> 1] | 0x0000;

	// Timers
	case this.TM0CNT_LO:
		return this.cpu.irq.timerRead(0);
	case this.TM1CNT_LO:
		return this.cpu.irq.timerRead(1);
	case this.TM2CNT_LO:
		return this.cpu.irq.timerRead(2);
	case this.TM3CNT_LO:
		return this.cpu.irq.timerRead(3);

	// SIO
	case this.SIOCNT:
		return this.sio.readSIOCNT();

	case this.KEYINPUT:
		this.keypad.pollGamepads();
		return this.keypad.currentDown;
	case this.KEYCNT:
		this.core.STUB('Unimplemented I/O register read: KEYCNT');
		return 0;

	case this.BG0HOFS:
	case this.BG0VOFS:
	case this.BG1HOFS:
	case this.BG1VOFS:
	case this.BG2HOFS:
	case this.BG2VOFS:
	case this.BG3HOFS:
	case this.BG3VOFS:
	case this.BG2PA:
	case this.BG2PB:
	case this.BG2PC:
	case this.BG2PD:
	case this.BG3PA:
	case this.BG3PB:
	case this.BG3PC:
	case this.BG3PD:
	case this.BG2X_LO:
	case this.BG2X_HI:
	case this.BG2Y_LO:
	case this.BG2Y_HI:
	case this.BG3X_LO:
	case this.BG3X_HI:
	case this.BG3Y_LO:
	case this.BG3Y_HI:
	case this.WIN0H:
	case this.WIN1H:
	case this.WIN0V:
	case this.WIN1V:
	case this.BLDY:
	case this.DMA0SAD_LO:
	case this.DMA0SAD_HI:
	case this.DMA0DAD_LO:
	case this.DMA0DAD_HI:
	case this.DMA0CNT_LO:
	case this.DMA1SAD_LO:
	case this.DMA1SAD_HI:
	case this.DMA1DAD_LO:
	case this.DMA1DAD_HI:
	case this.DMA1CNT_LO:
	case this.DMA2SAD_LO:
	case this.DMA2SAD_HI:
	case this.DMA2DAD_LO:
	case this.DMA2DAD_HI:
	case this.DMA2CNT_LO:
	case this.DMA3SAD_LO:
	case this.DMA3SAD_HI:
	case this.DMA3DAD_LO:
	case this.DMA3DAD_HI:
	case this.DMA3CNT_LO:
	case this.FIFO_A_LO:
	case this.FIFO_A_HI:
	case this.FIFO_B_LO:
	case this.FIFO_B_HI:
		this.core.WARN('Read for write-only register: 0x' + offset.toString(16));
		return this.core.mmu.badMemory.loadU16(0);

	case this.MOSAIC:
		this.core.WARN('Read for write-only register: 0x' + offset.toString(16));
		return 0;

	case this.SIOMULTI0:
 	case this.SIOMULTI1:
 	case this.SIOMULTI2:
 	case this.SIOMULTI3:
 		return this.sio.read((offset - this.SIOMULTI0) >> 1);

 	case this.SIODATA8:
 		this.core.STUB('Unimplemented SIO register read: 0x' + offset.toString(16));
 		return 0;
	case this.JOYCNT:
	case this.JOYSTAT:
 		this.core.STUB('Unimplemented JOY register read: 0x' + offset.toString(16));
 		return 0;

	default:
		this.core.WARN('Bad I/O register read: 0x' + offset.toString(16));
		return this.core.mmu.badMemory.loadU16(0);
	}
	return this.registers[offset >> 1];
};

GameBoyAdvanceIO.prototype.store8 = function(offset, value) {
	switch (offset) {
	case this.WININ:
		this.value & 0x3F;
		break;
	case this.WININ | 1:
		this.value & 0x3F;
		break;
	case this.WINOUT:
		this.value & 0x3F;
		break;
	case this.WINOUT | 1:
		this.value & 0x3F;
		break;
	case this.SOUND1CNT_LO:
	case this.SOUND1CNT_LO | 1:
	case this.SOUND1CNT_HI:
	case this.SOUND1CNT_HI | 1:
	case this.SOUND1CNT_X:
	case this.SOUND1CNT_X | 1:
	case this.SOUND2CNT_LO:
	case this.SOUND2CNT_LO | 1:
	case this.SOUND2CNT_HI:
	case this.SOUND2CNT_HI | 1:
	case this.SOUND3CNT_LO:
	case this.SOUND3CNT_LO | 1:
	case this.SOUND3CNT_HI:
	case this.SOUND3CNT_HI | 1:
	case this.SOUND3CNT_X:
	case this.SOUND3CNT_X | 1:
	case this.SOUND4CNT_LO:
	case this.SOUND4CNT_LO | 1:
	case this.SOUND4CNT_HI:
	case this.SOUND4CNT_HI | 1:
	case this.SOUNDCNT_LO:
	case this.SOUNDCNT_LO | 1:
	case this.SOUNDCNT_X:
	case this.IF:
	case this.IME:
		break;
	case this.SOUNDBIAS | 1:
		this.STUB_REG('sound', offset);
		break;
	case this.HALTCNT:
		value &= 0x80;
		if (!value) {
			this.core.irq.halt();
		} else {
			this.core.STUB('Stop');
		}
		return;
	default:
		this.STUB_REG('8-bit I/O', offset);
		break;
	}

	if (offset & 1) {
		value <<= 8;
		value |= (this.registers[offset >> 1] & 0x00FF);
	} else {
		value &= 0x00FF;
		value |= (this.registers[offset >> 1] & 0xFF00);
	}
	this.store16(offset & 0xFFFFFFE, value);
};

GameBoyAdvanceIO.prototype.store16 = function(offset, value) {
	switch (offset) {
	// Video
	case this.DISPCNT:
		this.video.renderPath.writeDisplayControl(value);
		break;
	case this.DISPSTAT:
		value &= this.video.DISPSTAT_MASK;
		this.video.writeDisplayStat(value);
		break;
	case this.BG0CNT:
		this.video.renderPath.writeBackgroundControl(0, value);
		break;
	case this.BG1CNT:
		this.video.renderPath.writeBackgroundControl(1, value);
		break;
	case this.BG2CNT:
		this.video.renderPath.writeBackgroundControl(2, value);
		break;
	case this.BG3CNT:
		this.video.renderPath.writeBackgroundControl(3, value);
		break;
	case this.BG0HOFS:
		this.video.renderPath.writeBackgroundHOffset(0, value);
		break;
	case this.BG0VOFS:
		this.video.renderPath.writeBackgroundVOffset(0, value);
		break;
	case this.BG1HOFS:
		this.video.renderPath.writeBackgroundHOffset(1, value);
		break;
	case this.BG1VOFS:
		this.video.renderPath.writeBackgroundVOffset(1, value);
		break;
	case this.BG2HOFS:
		this.video.renderPath.writeBackgroundHOffset(2, value);
		break;
	case this.BG2VOFS:
		this.video.renderPath.writeBackgroundVOffset(2, value);
		break;
	case this.BG3HOFS:
		this.video.renderPath.writeBackgroundHOffset(3, value);
		break;
	case this.BG3VOFS:
		this.video.renderPath.writeBackgroundVOffset(3, value);
		break;
	case this.BG2X_LO:
		this.video.renderPath.writeBackgroundRefX(2, (this.registers[(offset >> 1) | 1] << 16) | value);
		break;
	case this.BG2X_HI:
		this.video.renderPath.writeBackgroundRefX(2, this.registers[(offset >> 1) ^ 1] | (value << 16));
		break;
	case this.BG2Y_LO:
		this.video.renderPath.writeBackgroundRefY(2, (this.registers[(offset >> 1) | 1] << 16) | value);
		break;
	case this.BG2Y_HI:
		this.video.renderPath.writeBackgroundRefY(2, this.registers[(offset >> 1) ^ 1] | (value << 16));
		break;
	case this.BG2PA:
		this.video.renderPath.writeBackgroundParamA(2, value);
		break;
	case this.BG2PB:
		this.video.renderPath.writeBackgroundParamB(2, value);
		break;
	case this.BG2PC:
		this.video.renderPath.writeBackgroundParamC(2, value);
		break;
	case this.BG2PD:
		this.video.renderPath.writeBackgroundParamD(2, value);
		break;
	case this.BG3X_LO:
		this.video.renderPath.writeBackgroundRefX(3, (this.registers[(offset >> 1) | 1] << 16) | value);
		break;
	case this.BG3X_HI:
		this.video.renderPath.writeBackgroundRefX(3, this.registers[(offset >> 1) ^ 1] | (value << 16));
		break;
	case this.BG3Y_LO:
		this.video.renderPath.writeBackgroundRefY(3, (this.registers[(offset >> 1) | 1] << 16) | value);
		break;
	case this.BG3Y_HI:
		this.video.renderPath.writeBackgroundRefY(3, this.registers[(offset >> 1) ^ 1] | (value << 16));
		break;
	case this.BG3PA:
		this.video.renderPath.writeBackgroundParamA(3, value);
		break;
	case this.BG3PB:
		this.video.renderPath.writeBackgroundParamB(3, value);
		break;
	case this.BG3PC:
		this.video.renderPath.writeBackgroundParamC(3, value);
		break;
	case this.BG3PD:
		this.video.renderPath.writeBackgroundParamD(3, value);
		break;
	case this.WIN0H:
		this.video.renderPath.writeWin0H(value);
		break;
	case this.WIN1H:
		this.video.renderPath.writeWin1H(value);
		break;
	case this.WIN0V:
		this.video.renderPath.writeWin0V(value);
		break;
	case this.WIN1V:
		this.video.renderPath.writeWin1V(value);
		break;
	case this.WININ:
		value &= 0x3F3F;
		this.video.renderPath.writeWinIn(value);
		break;
	case this.WINOUT:
		value &= 0x3F3F;
		this.video.renderPath.writeWinOut(value);
		break;
	case this.BLDCNT:
		value &= 0x7FFF;
		this.video.renderPath.writeBlendControl(value);
		break;
	case this.BLDALPHA:
		value &= 0x1F1F;
		this.video.renderPath.writeBlendAlpha(value);
		break;
	case this.BLDY:
		value &= 0x001F;
		this.video.renderPath.writeBlendY(value);
		break;
	case this.MOSAIC:
		this.video.renderPath.writeMosaic(value);
		break;

	// Sound
	case this.SOUND1CNT_LO:
		value &= 0x007F;
		this.audio.writeSquareChannelSweep(0, value);
		break;
	case this.SOUND1CNT_HI:
		this.audio.writeSquareChannelDLE(0, value);
		break;
	case this.SOUND1CNT_X:
		value &= 0xC7FF;
		this.audio.writeSquareChannelFC(0, value);
		value &= ~0x8000;
		break;
	case this.SOUND2CNT_LO:
		this.audio.writeSquareChannelDLE(1, value);
		break;
	case this.SOUND2CNT_HI:
		value &= 0xC7FF;
		this.audio.writeSquareChannelFC(1, value);
		value &= ~0x8000;
		break;
	case this.SOUND3CNT_LO:
		value &= 0x00E0;
		this.audio.writeChannel3Lo(value);
		break;
	case this.SOUND3CNT_HI:
		value &= 0xE0FF;
		this.audio.writeChannel3Hi(value);
		break;
	case this.SOUND3CNT_X:
		value &= 0xC7FF;
		this.audio.writeChannel3X(value);
		value &= ~0x8000;
		break;
	case this.SOUND4CNT_LO:
		value &= 0xFF3F;
		this.audio.writeChannel4LE(value);
		break;
	case this.SOUND4CNT_HI:
		value &= 0xC0FF;
		this.audio.writeChannel4FC(value);
		value &= ~0x8000;
		break;
	case this.SOUNDCNT_LO:
		value &= 0xFF77;
		this.audio.writeSoundControlLo(value);
		break;
	case this.SOUNDCNT_HI:
		value &= 0xFF0F;
		this.audio.writeSoundControlHi(value);
		break;
	case this.SOUNDCNT_X:
		value &= 0x0080;
		this.audio.writeEnable(value);
		break;
	case this.WAVE_RAM0_LO:
	case this.WAVE_RAM0_HI:
	case this.WAVE_RAM1_LO:
	case this.WAVE_RAM1_HI:
	case this.WAVE_RAM2_LO:
	case this.WAVE_RAM2_HI:
	case this.WAVE_RAM3_LO:
	case this.WAVE_RAM3_HI:
		this.audio.writeWaveData(offset - this.WAVE_RAM0_LO, value, 2);
		break;

	// DMA
	case this.DMA0SAD_LO:
	case this.DMA0DAD_LO:
	case this.DMA1SAD_LO:
	case this.DMA1DAD_LO:
	case this.DMA2SAD_LO:
	case this.DMA2DAD_LO:
	case this.DMA3SAD_LO:
	case this.DMA3DAD_LO:
		this.store32(offset, (this.registers[(offset >> 1) + 1] << 16) | value);
		return;

	case this.DMA0SAD_HI:
	case this.DMA0DAD_HI:
	case this.DMA1SAD_HI:
	case this.DMA1DAD_HI:
	case this.DMA2SAD_HI:
	case this.DMA2DAD_HI:
	case this.DMA3SAD_HI:
	case this.DMA3DAD_HI:
		this.store32(offset - 2, this.registers[(offset >> 1) - 1] | (value << 16));
		return;

	case this.DMA0CNT_LO:
		this.cpu.irq.dmaSetWordCount(0, value);
		break;
	case this.DMA0CNT_HI:
		// The DMA registers need to set the values before writing the control, as writing the
		// control can synchronously trigger a DMA transfer
		this.registers[offset >> 1] = value & 0xFFE0;
		this.cpu.irq.dmaWriteControl(0, value);
		return;
	case this.DMA1CNT_LO:
		this.cpu.irq.dmaSetWordCount(1, value);
		break;
	case this.DMA1CNT_HI:
		this.registers[offset >> 1] = value & 0xFFE0;
		this.cpu.irq.dmaWriteControl(1, value);
		return;
	case this.DMA2CNT_LO:
		this.cpu.irq.dmaSetWordCount(2, value);
		break;
	case this.DMA2CNT_HI:
		this.registers[offset >> 1] = value & 0xFFE0;
		this.cpu.irq.dmaWriteControl(2, value);
		return;
	case this.DMA3CNT_LO:
		this.cpu.irq.dmaSetWordCount(3, value);
		break;
	case this.DMA3CNT_HI:
		this.registers[offset >> 1] = value & 0xFFE0;
		this.cpu.irq.dmaWriteControl(3, value);
		return;

	// Timers
	case this.TM0CNT_LO:
		this.cpu.irq.timerSetReload(0, value);
		return;
	case this.TM1CNT_LO:
		this.cpu.irq.timerSetReload(1, value);
		return;
	case this.TM2CNT_LO:
		this.cpu.irq.timerSetReload(2, value);
		return;
	case this.TM3CNT_LO:
		this.cpu.irq.timerSetReload(3, value);
		return;

	case this.TM0CNT_HI:
		value &= 0x00C7
		this.cpu.irq.timerWriteControl(0, value);
		break;
	case this.TM1CNT_HI:
		value &= 0x00C7
		this.cpu.irq.timerWriteControl(1, value);
		break;
	case this.TM2CNT_HI:
		value &= 0x00C7
		this.cpu.irq.timerWriteControl(2, value);
		break;
	case this.TM3CNT_HI:
		value &= 0x00C7
		this.cpu.irq.timerWriteControl(3, value);
		break;

	// SIO
	case this.SIOMULTI0:
 	case this.SIOMULTI1:
 	case this.SIOMULTI2:
 	case this.SIOMULTI3:
 	case this.SIODATA8:
 		this.STUB_REG('SIO', offset);
 		break;
	case this.RCNT:
		this.sio.setMode(((value >> 12) & 0xC) | ((this.registers[this.SIOCNT >> 1] >> 12) & 0x3));
		this.sio.writeRCNT(value);
		break;
	case this.SIOCNT:
		this.sio.setMode(((value >> 12) & 0x3) | ((this.registers[this.RCNT >> 1] >> 12) & 0xC));
		this.sio.writeSIOCNT(value);
		return;
	case this.JOYCNT:
	case this.JOYSTAT:
		this.STUB_REG('JOY', offset);
		break;

	// Misc
	case this.IE:
		value &= 0x3FFF;
		this.cpu.irq.setInterruptsEnabled(value);
		break;
	case this.IF:
		this.cpu.irq.dismissIRQs(value);
		return;
	case this.WAITCNT:
		value &= 0xDFFF;
		this.cpu.mmu.adjustTimings(value);
		break;
	case this.IME:
		value &= 0x0001;
		this.cpu.irq.masterEnable(value);
		break;
	default:
		this.STUB_REG('I/O', offset);
	}
	this.registers[offset >> 1] = value;
};

GameBoyAdvanceIO.prototype.store32 = function(offset, value) {
	switch (offset) {
	case this.BG2X_LO:
		value &= 0x0FFFFFFF;
		this.video.renderPath.writeBackgroundRefX(2, value);
		break;
	case this.BG2Y_LO:
		value &= 0x0FFFFFFF;
		this.video.renderPath.writeBackgroundRefY(2, value);
		break;
	case this.BG3X_LO:
		value &= 0x0FFFFFFF;
		this.video.renderPath.writeBackgroundRefX(3, value);
		break;
	case this.BG3Y_LO:
		value &= 0x0FFFFFFF;
		this.video.renderPath.writeBackgroundRefY(3, value);
		break;
	case this.DMA0SAD_LO:
		this.cpu.irq.dmaSetSourceAddress(0, value);
		break;
	case this.DMA0DAD_LO:
		this.cpu.irq.dmaSetDestAddress(0, value);
		break;
	case this.DMA1SAD_LO:
		this.cpu.irq.dmaSetSourceAddress(1, value);
		break;
	case this.DMA1DAD_LO:
		this.cpu.irq.dmaSetDestAddress(1, value);
		break;
	case this.DMA2SAD_LO:
		this.cpu.irq.dmaSetSourceAddress(2, value);
		break;
	case this.DMA2DAD_LO:
		this.cpu.irq.dmaSetDestAddress(2, value);
		break;
	case this.DMA3SAD_LO:
		this.cpu.irq.dmaSetSourceAddress(3, value);
		break;
	case this.DMA3DAD_LO:
		this.cpu.irq.dmaSetDestAddress(3, value);
		break;
	case this.FIFO_A_LO:
		this.audio.appendToFifoA(value);
		return;
	case this.FIFO_B_LO:
		this.audio.appendToFifoB(value);
		return;

	// High bits of this write should be ignored
	case this.IME:
		this.store16(offset, value & 0xFFFF);
		return;
	case this.JOY_RECV:
	case this.JOY_TRANS:
		this.STUB_REG('JOY', offset);
		return;
	default:
		this.store16(offset, value & 0xFFFF);
		this.store16(offset | 2, value >>> 16);
		return;
	}

	this.registers[offset >> 1] = value & 0xFFFF;
	this.registers[(offset >> 1) + 1] = value >>> 16;
};

GameBoyAdvanceIO.prototype.invalidatePage = function(address) {};

GameBoyAdvanceIO.prototype.STUB_REG = function(type, offset) {
	this.core.STUB('Unimplemented ' + type + ' register write: ' + offset.toString(16));
};

function GameBoyAdvanceAudio() {
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	if (window.AudioContext) {
		var self = this;
		this.context = new AudioContext();
		this.bufferSize = 0;
		this.bufferSize = 4096;
		this.maxSamples = this.bufferSize << 2;
		this.buffers = [new Float32Array(this.maxSamples), new Float32Array(this.maxSamples)];
		this.sampleMask = this.maxSamples - 1;
		if (this.context.createScriptProcessor) {
			this.jsAudio = this.context.createScriptProcessor(this.bufferSize);
		} else {
			this.jsAudio = this.context.createJavaScriptNode(this.bufferSize);
		}
		this.jsAudio.onaudioprocess = function(e) { self.audioProcess(e) };
	} else {
		this.context = null;
	}

	this.masterEnable = true;
	this.masterVolume = 1.0;

	this.SOUND_MAX = 0x400;
	this.FIFO_MAX = 0x200;
	this.PSG_MAX = 0x080;
};

GameBoyAdvanceAudio.prototype.clear = function() {
	this.fifoA = [];
	this.fifoB = [];
	this.fifoASample = 0;
	this.fifoBSample = 0;

	this.enabled = false;
	if (this.context) {
		try {
			this.jsAudio.disconnect(this.context.destination);
		} catch (e) {
		}
	}

	this.enableChannel3 = false;
	this.enableChannel4 = false;
	this.enableChannelA = false;
	this.enableChannelB = false;
	this.enableRightChannelA = false;
	this.enableLeftChannelA = false;
	this.enableRightChannelB = false;
	this.enableLeftChannelB = false;

	this.playingChannel3 = false;
	this.playingChannel4 = false;

	this.volumeLeft = 0;
	this.volumeRight = 0;
	this.ratioChannelA = 1;
	this.ratioChannelB = 1;
	this.enabledLeft = 0;
	this.enabledRight = 0;

	this.dmaA = -1;
	this.dmaB = -1;
	this.soundTimerA = 0;
	this.soundTimerB = 0;

	this.soundRatio = 1;
	this.soundBias = 0x200;

	this.squareChannels = new Array();
	for (var i = 0; i < 2; ++i) {
		this.squareChannels[i] = {
			enabled: false,
			playing: false,
			sample: 0,
			duty: 0.5,
			increment: 0,
			step: 0,
			initialVolume: 0,
			volume: 0,
			frequency: 0,
			interval: 0,
			sweepSteps: 0,
			sweepIncrement: 0,
			sweepInterval: 0,
			doSweep: false,
			raise: 0,
			lower: 0,
			nextStep: 0,
			timed: false,
			length: 0,
			end: 0
		}
	}

	this.waveData = new Uint8Array(32);
	this.channel3Dimension = 0;
	this.channel3Bank = 0;
	this.channel3Volume = 0;
	this.channel3Interval = 0;
	this.channel3Next = 0;
	this.channel3Length = 0;
	this.channel3Timed = false;
	this.channel3End = 0;
	this.channel3Pointer =0;
	this.channel3Sample = 0;

	this.cpuFrequency = this.core.irq.FREQUENCY;

	this.channel4 = {
		sample: 0,
		lfsr: 0,
		width: 15,
		interval: this.cpuFrequency / 524288,
		increment: 0,
		step: 0,
		initialVolume: 0,
		volume: 0,
		nextStep: 0,
		timed: false,
		length: 0,
		end: 0
	};

	this.nextEvent = 0;

	this.nextSample = 0;
	this.outputPointer = 0;
	this.samplePointer = 0;

	this.backup = 0;
	this.totalSamples = 0;

	this.sampleRate = 32768;
	this.sampleInterval = this.cpuFrequency / this.sampleRate;
	this.resampleRatio = 1;
	if (this.context) {
		this.resampleRatio = this.sampleRate / this.context.sampleRate;
	}

	this.writeSquareChannelFC(0, 0);
	this.writeSquareChannelFC(1, 0);
	this.writeChannel4FC(0);
};

GameBoyAdvanceAudio.prototype.freeze = function() {
	return {
		nextSample: this.nextSample
	};
};

GameBoyAdvanceAudio.prototype.defrost = function(frost) {
	this.nextSample = frost.nextSample;
};

GameBoyAdvanceAudio.prototype.pause = function(paused) {
	if (this.context) {
		if (paused) {
			try {
				this.jsAudio.disconnect(this.context.destination);
			} catch (e) {
				// Sigh
			}
		} else if (this.enabled) {
			this.jsAudio.connect(this.context.destination);
		}
	}
};

GameBoyAdvanceAudio.prototype.updateTimers = function() {
	var cycles = this.cpu.cycles;
	if (!this.enabled || (cycles < this.nextEvent && cycles < this.nextSample)) {
		return;
	}

	if (cycles >= this.nextEvent) {
		var channel = this.squareChannels[0];
		this.nextEvent = Infinity;
		if (channel.playing) {
			this.updateSquareChannel(channel, cycles);
		}

		channel = this.squareChannels[1];
		if (channel.playing) {
			this.updateSquareChannel(channel, cycles);
		}

		if (this.enableChannel3 && this.playingChannel3) {
			if (cycles >= this.channel3Next) {
				if (this.channel3Write) {
					var sample = this.waveData[this.channel3Pointer >> 1];
					this.channel3Sample = (((sample >> ((this.channel3Pointer & 1) << 2)) & 0xF) - 0x8) / 8;
					this.channel3Pointer = (this.channel3Pointer + 1);
					if (this.channel3Dimension && this.channel3Pointer >= 64) {
						this.channel3Pointer -= 64;
					} else if (!this.channel3Bank && this.channel3Pointer >= 32) {
						this.channel3Pointer -= 32;
					} else if (this.channel3Pointer >= 64) {
						this.channel3Pointer -= 32;
					}
				}
				this.channel3Next += this.channel3Interval;
				if (this.channel3Interval && this.nextEvent > this.channel3Next) {
					this.nextEvent = this.channel3Next;
				}
			}
			if (this.channel3Timed && cycles >= this.channel3End) {
				this.playingChannel3 = false;
			}
		}

		if (this.enableChannel4 && this.playingChannel4) {
			if (this.channel4.timed && cycles >= this.channel4.end) {
				this.playingChannel4 = false;
			} else {
				if (cycles >= this.channel4.next) {
					this.channel4.lfsr >>= 1;
					var sample = this.channel4.lfsr & 1;
					this.channel4.lfsr |= (((this.channel4.lfsr >> 1) & 1) ^ sample) << (this.channel4.width - 1);
					this.channel4.next += this.channel4.interval;
					this.channel4.sample = (sample - 0.5) * 2 * this.channel4.volume;
				}
				this.updateEnvelope(this.channel4, cycles);
				if (this.nextEvent > this.channel4.next) {
					this.nextEvent = this.channel4.next;
				}
				if (this.channel4.timed && this.nextEvent > this.channel4.end) {
					this.nextEvent = this.channel4.end;
				}
			}
		}
	}

	if (cycles >= this.nextSample) {
		this.sample();
		this.nextSample += this.sampleInterval;
	}

	this.nextEvent = Math.ceil(this.nextEvent);
	if ((this.nextEvent < cycles) || (this.nextSample < cycles)) {
		// STM instructions may take a long time
		this.updateTimers();
	}
};

GameBoyAdvanceAudio.prototype.writeEnable = function(value) {
	this.enabled = !!value;
	this.nextEvent = this.cpu.cycles;
	this.nextSample = this.nextEvent;
	this.updateTimers();
	this.core.irq.pollNextEvent();
	if (this.context) {
		if (value) {
			this.jsAudio.connect(this.context.destination);
		} else {
			try {
				this.jsAudio.disconnect(this.context.destination);
			} catch (e) {
			}
		}
	}
};

GameBoyAdvanceAudio.prototype.writeSoundControlLo = function(value) {
	this.masterVolumeLeft = value & 0x7;
	this.masterVolumeRight = (value >> 4) & 0x7;
	this.enabledLeft = (value >> 8) & 0xF;
	this.enabledRight = (value >> 12) & 0xF;

	this.setSquareChannelEnabled(this.squareChannels[0], (this.enabledLeft | this.enabledRight) & 0x1);
	this.setSquareChannelEnabled(this.squareChannels[1], (this.enabledLeft | this.enabledRight) & 0x2);
	this.enableChannel3 = (this.enabledLeft | this.enabledRight) & 0x4;
	this.setChannel4Enabled((this.enabledLeft | this.enabledRight) & 0x8);

	this.updateTimers();
	this.core.irq.pollNextEvent();
};

GameBoyAdvanceAudio.prototype.writeSoundControlHi = function(value) {
	switch (value & 0x0003) {
	case 0:
		this.soundRatio = 0.25;
		break;
	case 1:
		this.soundRatio = 0.50;
		break;
	case 2:
		this.soundRatio = 1;
		break;
	}
	this.ratioChannelA = (((value & 0x0004) >> 2) + 1) * 0.5;
	this.ratioChannelB = (((value & 0x0008) >> 3) + 1) * 0.5;

	this.enableRightChannelA = value & 0x0100;
	this.enableLeftChannelA = value & 0x0200;
	this.enableChannelA  = value & 0x0300;
	this.soundTimerA = value & 0x0400;
	if (value & 0x0800) {
		this.fifoA = [];
	}
	this.enableRightChannelB = value & 0x1000;
	this.enableLeftChannelB = value & 0x2000;
	this.enableChannelB  = value & 0x3000;
	this.soundTimerB = value & 0x4000;
	if (value & 0x8000) {
		this.fifoB = [];
	}
};

GameBoyAdvanceAudio.prototype.resetSquareChannel = function(channel) {
	if (channel.step) {
		channel.nextStep = this.cpu.cycles + channel.step;
	}
	if (channel.enabled && !channel.playing) {
		channel.raise = this.cpu.cycles;
		channel.lower = channel.raise + channel.duty * channel.interval;
		channel.end = this.cpu.cycles + channel.length;
		this.nextEvent = this.cpu.cycles;
	}
	channel.playing = channel.enabled;
	this.updateTimers();
	this.core.irq.pollNextEvent();
};

GameBoyAdvanceAudio.prototype.setSquareChannelEnabled = function(channel, enable) {
	if (!(channel.enabled && channel.playing) && enable) {
		channel.enabled = !!enable;
		this.updateTimers();
		this.core.irq.pollNextEvent();
	} else {
		channel.enabled = !!enable;
	}
};

GameBoyAdvanceAudio.prototype.writeSquareChannelSweep = function(channelId, value) {
	var channel = this.squareChannels[channelId];
	channel.sweepSteps = value & 0x07;
	channel.sweepIncrement = (value & 0x08) ? -1 : 1;
	channel.sweepInterval = ((value >> 4) & 0x7) * this.cpuFrequency / 128;
	channel.doSweep = !!channel.sweepInterval;
	channel.nextSweep = this.cpu.cycles + channel.sweepInterval;
	this.resetSquareChannel(channel);
};

GameBoyAdvanceAudio.prototype.writeSquareChannelDLE = function(channelId, value) {
	var channel = this.squareChannels[channelId];
	var duty = (value >> 6) & 0x3;
	switch (duty) {
	case 0:
		channel.duty = 0.125;
		break;
	case 1:
		channel.duty = 0.25;
		break;
	case 2:
		channel.duty = 0.5;
		break;
	case 3:
		channel.duty = 0.75;
		break;
	}
	this.writeChannelLE(channel, value);
	this.resetSquareChannel(channel);
};

GameBoyAdvanceAudio.prototype.writeSquareChannelFC = function(channelId, value) {
	var channel = this.squareChannels[channelId];
	var frequency = value & 2047;
	channel.frequency = frequency;
	channel.interval = this.cpuFrequency * (2048 - frequency) / 131072;
	channel.timed = !!(value & 0x4000);

	if (value & 0x8000) {
		this.resetSquareChannel(channel);
		channel.volume = channel.initialVolume;
	}
};

GameBoyAdvanceAudio.prototype.updateSquareChannel = function(channel, cycles) {
	if (channel.timed && cycles >= channel.end) {
		channel.playing = false;
		return;
	}

	if (channel.doSweep && cycles >= channel.nextSweep) {
		channel.frequency += channel.sweepIncrement * (channel.frequency >> channel.sweepSteps);
		if (channel.frequency < 0) {
			channel.frequency = 0;
		} else if (channel.frequency > 2047) {
			channel.frequency = 2047;
			channel.playing = false;
			return;
		}
		channel.interval = this.cpuFrequency * (2048 - channel.frequency) / 131072;
		channel.nextSweep += channel.sweepInterval;
	}

	if (cycles >= channel.raise) {
		channel.sample = channel.volume;
		channel.lower = channel.raise + channel.duty * channel.interval;
		channel.raise += channel.interval;
	} else if (cycles >= channel.lower) {
		channel.sample = -channel.volume;
		channel.lower += channel.interval;
	}

	this.updateEnvelope(channel, cycles);

	if (this.nextEvent > channel.raise) {
		this.nextEvent = channel.raise;
	}
	if (this.nextEvent > channel.lower) {
		this.nextEvent = channel.lower;
	}
	if (channel.timed && this.nextEvent > channel.end) {
		this.nextEvent = channel.end;
	}
	if (channel.doSweep && this.nextEvent > channel.nextSweep) {
		this.nextEvent = channel.nextSweep;
	}
};

GameBoyAdvanceAudio.prototype.writeChannel3Lo = function(value) {
	this.channel3Dimension = value & 0x20;
	this.channel3Bank = value & 0x40;
	var enable = value & 0x80;
	if (!this.channel3Write && enable) {
		this.channel3Write = enable;
		this.resetChannel3();
	} else {
		this.channel3Write = enable;
	}
};

GameBoyAdvanceAudio.prototype.writeChannel3Hi = function(value) {
	this.channel3Length = this.cpuFrequency * (0x100 - (value & 0xFF)) / 256;
	var volume = (value >> 13) & 0x7;
	switch (volume) {
	case 0:
		this.channel3Volume = 0;
		break;
	case 1:
		this.channel3Volume = 1;
		break;
	case 2:
		this.channel3Volume = 0.5;
		break;
	case 3:
		this.channel3Volume = 0.25;
		break;
	default:
		this.channel3Volume = 0.75;
	}
};

GameBoyAdvanceAudio.prototype.writeChannel3X = function(value) {
	this.channel3Interval = this.cpuFrequency * (2048 - (value & 0x7FF)) / 2097152;
	this.channel3Timed = !!(value & 0x4000);
	if (this.channel3Write) {
		this.resetChannel3();
	}
};

GameBoyAdvanceAudio.prototype.resetChannel3 = function() {
	this.channel3Next = this.cpu.cycles;
	this.nextEvent = this.channel3Next;
	this.channel3End = this.cpu.cycles + this.channel3Length;
	this.playingChannel3 = this.channel3Write;
	this.updateTimers();
	this.core.irq.pollNextEvent();
};

GameBoyAdvanceAudio.prototype.writeWaveData = function(offset, data, width) {
	if (!this.channel3Bank) {
		offset += 16;
	}
	if (width == 2) {
		this.waveData[offset] = data & 0xFF;
		data >>= 8;
		++offset;
	}
	this.waveData[offset] = data & 0xFF;
};

GameBoyAdvanceAudio.prototype.setChannel4Enabled = function(enable) {
	if (!this.enableChannel4 && enable) {
		this.channel4.next = this.cpu.cycles;
		this.channel4.end = this.cpu.cycles + this.channel4.length;
		this.enableChannel4 = true;
		this.playingChannel4 = true;
		this.nextEvent = this.cpu.cycles;
		this.updateEnvelope(this.channel4);
		this.updateTimers();
		this.core.irq.pollNextEvent();
	} else {
		this.enableChannel4 = enable;
	}
}

GameBoyAdvanceAudio.prototype.writeChannel4LE = function(value) {
	this.writeChannelLE(this.channel4, value);
	this.resetChannel4();
};

GameBoyAdvanceAudio.prototype.writeChannel4FC = function(value) {
	this.channel4.timed = !!(value & 0x4000);

	var r = value & 0x7;
	if (!r) {
		r = 0.5;
	}
	var s = (value >> 4) & 0xF;
	var interval = this.cpuFrequency * (r * (2 << s)) / 524288;
	if (interval != this.channel4.interval) {
		this.channel4.interval = interval;
		this.resetChannel4();
	}

	var width = (value & 0x8) ? 7 : 15;
	if (width != this.channel4.width) {
		this.channel4.width = width;
		this.resetChannel4();
	}

	if (value & 0x8000) {
		this.resetChannel4();
	}
};

GameBoyAdvanceAudio.prototype.resetChannel4 = function() {
	if (this.channel4.width == 15) {
		this.channel4.lfsr = 0x4000;
	} else {
		this.channel4.lfsr = 0x40;
	}
	this.channel4.volume = this.channel4.initialVolume;
	if (this.channel4.step) {
		this.channel4.nextStep = this.cpu.cycles + this.channel4.step;
	}
	this.channel4.end = this.cpu.cycles + this.channel4.length;
	this.channel4.next = this.cpu.cycles;
	this.nextEvent = this.channel4.next;

	this.playingChannel4 = this.enableChannel4;
	this.updateTimers();
	this.core.irq.pollNextEvent();
};

GameBoyAdvanceAudio.prototype.writeChannelLE = function(channel, value) {
	channel.length = this.cpuFrequency * ((0x40 - (value & 0x3F)) / 256);

	if (value & 0x0800) {
		channel.increment = 1 / 16;
	} else {
		channel.increment = -1 / 16;
	}
	channel.initialVolume = ((value >> 12) & 0xF) / 16;

	channel.step = this.cpuFrequency * (((value >> 8) & 0x7) / 64);
};

GameBoyAdvanceAudio.prototype.updateEnvelope = function(channel, cycles) {
	if (channel.step) {
		if (cycles >= channel.nextStep) {
			channel.volume += channel.increment;
			if (channel.volume > 1) {
				channel.volume = 1;
			} else if (channel.volume < 0) {
				channel.volume = 0;
			}
			channel.nextStep += channel.step;
		}

		if (this.nextEvent > channel.nextStep) {
			this.nextEvent = channel.nextStep;
		}
	}
};

GameBoyAdvanceAudio.prototype.appendToFifoA = function(value) {
	var b;
	if (this.fifoA.length > 28) {
		this.fifoA = this.fifoA.slice(-28);
	}
	for (var i = 0; i < 4; ++i) {
		b = (value & 0xFF) << 24;
		value >>= 8;
		this.fifoA.push(b / 0x80000000);
	}
};

GameBoyAdvanceAudio.prototype.appendToFifoB = function(value) {
	var b;
	if (this.fifoB.length > 28) {
		this.fifoB = this.fifoB.slice(-28);
	}
	for (var i = 0; i < 4; ++i) {
		b = (value & 0xFF) << 24;
		value >>= 8;
		this.fifoB.push(b / 0x80000000);
	}
};

GameBoyAdvanceAudio.prototype.sampleFifoA = function() {
	if (this.fifoA.length <= 16) {
		var dma = this.core.irq.dma[this.dmaA];
		dma.nextCount = 4;
		this.core.mmu.serviceDma(this.dmaA, dma);
	}
	this.fifoASample = this.fifoA.shift();
};

GameBoyAdvanceAudio.prototype.sampleFifoB = function() {
	if (this.fifoB.length <= 16) {
		var dma = this.core.irq.dma[this.dmaB];
		dma.nextCount = 4;
		this.core.mmu.serviceDma(this.dmaB, dma);
	}
	this.fifoBSample = this.fifoB.shift();
};

GameBoyAdvanceAudio.prototype.scheduleFIFODma = function(number, info) {
	switch (info.dest) {
	case this.cpu.mmu.BASE_IO | this.cpu.irq.io.FIFO_A_LO:
		// FIXME: is this needed or a hack?
		info.dstControl = 2;
		this.dmaA = number;
		break;
	case this.cpu.mmu.BASE_IO | this.cpu.irq.io.FIFO_B_LO:
		info.dstControl = 2;
		this.dmaB = number;
		break;
	default:
		this.core.WARN('Tried to schedule FIFO DMA for non-FIFO destination');
		break;
	}
};

GameBoyAdvanceAudio.prototype.sample = function() {
	var sampleLeft = 0;
	var sampleRight = 0;
	var sample;
	var channel;

	channel = this.squareChannels[0];
	if (channel.playing) {
		sample = channel.sample * this.soundRatio * this.PSG_MAX;
		if (this.enabledLeft & 0x1) {
			sampleLeft += sample;
		}
		if (this.enabledRight & 0x1) {
			sampleRight += sample;
		}
	}

	channel = this.squareChannels[1];
	if (channel.playing) {
		sample = channel.sample * this.soundRatio * this.PSG_MAX;
		if (this.enabledLeft & 0x2) {
			sampleLeft += sample;
		}
		if (this.enabledRight & 0x2) {
			sampleRight += sample;
		}
	}

	if (this.playingChannel3) {
		sample = this.channel3Sample * this.soundRatio * this.channel3Volume * this.PSG_MAX;
		if (this.enabledLeft & 0x4) {
			sampleLeft += sample;
		}
		if (this.enabledRight & 0x4) {
			sampleRight += sample;
		}
	}

	if (this.playingChannel4) {
		sample = this.channel4.sample * this.soundRatio * this.PSG_MAX;
		if (this.enabledLeft & 0x8) {
			sampleLeft += sample;
		}
		if (this.enabledRight & 0x8) {
			sampleRight += sample;
		}
	}

	if (this.enableChannelA) {
		sample = this.fifoASample * this.FIFO_MAX * this.ratioChannelA;
		if (this.enableLeftChannelA) {
			sampleLeft += sample;
		}
		if (this.enableRightChannelA) {
			sampleRight += sample;
		}
	}

	if (this.enableChannelB) {
		sample = this.fifoBSample * this.FIFO_MAX * this.ratioChannelB;
		if (this.enableLeftChannelB) {
			sampleLeft += sample;
		}
		if (this.enableRightChannelB) {
			sampleRight += sample;
		}
	}

	var samplePointer = this.samplePointer;
	sampleLeft *= this.masterVolume / this.SOUND_MAX;
	sampleLeft = Math.max(Math.min(sampleLeft, 1), -1);
	sampleRight *= this.masterVolume / this.SOUND_MAX;
	sampleRight = Math.max(Math.min(sampleRight, 1), -1);
	if (this.buffers) {
		this.buffers[0][samplePointer] = sampleLeft;
		this.buffers[1][samplePointer] = sampleRight;
	}
	this.samplePointer = (samplePointer + 1) & this.sampleMask;
};

GameBoyAdvanceAudio.prototype.audioProcess = function(audioProcessingEvent) {
	var left = audioProcessingEvent.outputBuffer.getChannelData(0);
	var right = audioProcessingEvent.outputBuffer.getChannelData(1);
	if (this.masterEnable) {
		var i;
		var o = this.outputPointer;
		for (i = 0; i < this.bufferSize; ++i, o += this.resampleRatio) {
			if (o >= this.maxSamples) {
				o -= this.maxSamples;
			}
			if ((o | 0) == this.samplePointer) {
				++this.backup;
				break;
			}
			left[i] = this.buffers[0][o | 0];
			right[i] = this.buffers[1][o | 0];
		}
		for (; i < this.bufferSize; ++i) {
			left[i] = 0;
			right[i] = 0;
		}
		this.outputPointer = o;
		++this.totalSamples;
	} else {
		for (i = 0; i < this.bufferSize; ++i) {
			left[i] = 0;
			right[i] = 0;
		}
	}
};

function GameBoyAdvanceVideo() {
	this.renderPath = new GameBoyAdvanceSoftwareRenderer();

	this.CYCLES_PER_PIXEL = 4;

	this.HORIZONTAL_PIXELS = 240;
	this.HBLANK_PIXELS = 68;
	this.HDRAW_LENGTH = 1006;
	this.HBLANK_LENGTH = 226;
	this.HORIZONTAL_LENGTH = 1232;

	this.VERTICAL_PIXELS = 160;
	this.VBLANK_PIXELS = 68;
	this.VERTICAL_TOTAL_PIXELS = 228;

	this.TOTAL_LENGTH = 280896;

	this.drawCallback = function() {};
	this.vblankCallback = function() {};
};

GameBoyAdvanceVideo.prototype.clear = function() {
	this.renderPath.clear(this.cpu.mmu);

	// DISPSTAT
	this.DISPSTAT_MASK = 0xFF38;
	this.inHblank = false;
	this.inVblank = false;
	this.vcounter = 0;
	this.vblankIRQ = 0;
	this.hblankIRQ = 0;
	this.vcounterIRQ = 0;
	this.vcountSetting = 0;

	// VCOUNT
	this.vcount = -1;

	this.lastHblank = 0;
	this.nextHblank = this.HDRAW_LENGTH;
	this.nextEvent = this.nextHblank;

	this.nextHblankIRQ = 0;
	this.nextVblankIRQ = 0;
	this.nextVcounterIRQ = 0;
};

GameBoyAdvanceVideo.prototype.freeze = function() {
	return {
		'inHblank': this.inHblank,
		'inVblank': this.inVblank,
		'vcounter': this.vcounter,
		'vblankIRQ': this.vblankIRQ,
		'hblankIRQ': this.hblankIRQ,
		'vcounterIRQ': this.vcounterIRQ,
		'vcountSetting': this.vcountSetting,
		'vcount': this.vcount,
		'lastHblank': this.lastHblank,
		'nextHblank': this.nextHblank,
		'nextEvent': this.nextEvent,
		'nextHblankIRQ': this.nextHblankIRQ,
		'nextVblankIRQ': this.nextVblankIRQ,
		'nextVcounterIRQ': this.nextVcounterIRQ,
		'renderPath': this.renderPath.freeze(this.core.encodeBase64)
	};
};

GameBoyAdvanceVideo.prototype.defrost = function(frost) {
	this.inHblank = frost.inHblank;
	this.inVblank = frost.inVblank;
	this.vcounter = frost.vcounter;
	this.vblankIRQ = frost.vblankIRQ;
	this.hblankIRQ = frost.hblankIRQ;
	this.vcounterIRQ = frost.vcounterIRQ;
	this.vcountSetting = frost.vcountSetting;
	this.vcount = frost.vcount;
	this.lastHblank = frost.lastHblank;
	this.nextHblank = frost.nextHblank;
	this.nextEvent = frost.nextEvent;
	this.nextHblankIRQ = frost.nextHblankIRQ;
	this.nextVblankIRQ = frost.nextVblankIRQ;
	this.nextVcounterIRQ = frost.nextVcounterIRQ;
	this.renderPath.defrost(frost.renderPath, this.core.decodeBase64);
};

GameBoyAdvanceVideo.prototype.setBacking = function(backing) {
	var pixelData = backing.createImageData(this.HORIZONTAL_PIXELS, this.VERTICAL_PIXELS);
	this.context = backing;

	// Clear backing first
	for (var offset = 0; offset < this.HORIZONTAL_PIXELS * this.VERTICAL_PIXELS * 4;) {
		pixelData.data[offset++] = 0xFF;
		pixelData.data[offset++] = 0xFF;
		pixelData.data[offset++] = 0xFF;
		pixelData.data[offset++] = 0xFF;
	}

	this.renderPath.setBacking(pixelData);
}

GameBoyAdvanceVideo.prototype.updateTimers = function(cpu) {
	var cycles = cpu.cycles;

	if (this.nextEvent <= cycles) {
		if (this.inHblank) {
			// End Hblank
			this.inHblank = false;
			this.nextEvent = this.nextHblank;

			++this.vcount;

			switch (this.vcount) {
			case this.VERTICAL_PIXELS:
				this.inVblank = true;
				this.renderPath.finishDraw(this);
				this.nextVblankIRQ = this.nextEvent + this.TOTAL_LENGTH;
				this.cpu.mmu.runVblankDmas();
				if (this.vblankIRQ) {
					this.cpu.irq.raiseIRQ(this.cpu.irq.IRQ_VBLANK);
				}
				this.vblankCallback();
				break;
			case this.VERTICAL_TOTAL_PIXELS - 1:
				this.inVblank = false;
				break;
			case this.VERTICAL_TOTAL_PIXELS:
				this.vcount = 0;
				this.renderPath.startDraw();
				break;
			}

			this.vcounter = this.vcount == this.vcountSetting;
			if (this.vcounter && this.vcounterIRQ) {
				this.cpu.irq.raiseIRQ(this.cpu.irq.IRQ_VCOUNTER);
				this.nextVcounterIRQ += this.TOTAL_LENGTH;
			}

			if (this.vcount < this.VERTICAL_PIXELS) {
				this.renderPath.drawScanline(this.vcount);
			}
		} else {
			// Begin Hblank
			this.inHblank = true;
			this.lastHblank = this.nextHblank;
			this.nextEvent = this.lastHblank + this.HBLANK_LENGTH;
			this.nextHblank = this.nextEvent + this.HDRAW_LENGTH;
			this.nextHblankIRQ = this.nextHblank;

			if (this.vcount < this.VERTICAL_PIXELS) {
				this.cpu.mmu.runHblankDmas();
			}
			if (this.hblankIRQ) {
				this.cpu.irq.raiseIRQ(this.cpu.irq.IRQ_HBLANK);
			}
		}
	}
};

GameBoyAdvanceVideo.prototype.writeDisplayStat = function(value) {
	this.vblankIRQ = value & 0x0008;
	this.hblankIRQ = value & 0x0010;
	this.vcounterIRQ = value & 0x0020;
	this.vcountSetting = (value & 0xFF00) >> 8;

	if (this.vcounterIRQ) {
		// FIXME: this can be too late if we're in the middle of an Hblank
		this.nextVcounterIRQ = this.nextHblank + this.HBLANK_LENGTH + (this.vcountSetting - this.vcount) * this.HORIZONTAL_LENGTH;
		if (this.nextVcounterIRQ < this.nextEvent) {
			this.nextVcounterIRQ += this.TOTAL_LENGTH;
		}
	}
};

GameBoyAdvanceVideo.prototype.readDisplayStat = function() {
	return (this.inVblank) | (this.inHblank << 1) | (this.vcounter << 2);
};

GameBoyAdvanceVideo.prototype.finishDraw = function(pixelData) {
	this.context.putImageData(pixelData, 0, 0);
	this.drawCallback();
};

function MemoryProxy(owner, size, blockSize) {
	this.owner = owner;
	this.blocks = [];
	this.blockSize = blockSize;
	this.mask = (1 << blockSize) - 1;
	this.size = size;
	if (blockSize) {
		for (var i = 0; i < (size >> blockSize); ++i) {
			this.blocks.push(new MemoryView(new ArrayBuffer(1 << blockSize)));
		}
	} else {
		this.blockSize = 31;
		this.mask = -1;
		this.blocks[0] = new MemoryView(new ArrayBuffer(size));
	}
};

MemoryProxy.prototype.combine = function() {
	if (this.blocks.length > 1) {
		var combined = new Uint8Array(this.size);
		for (var i = 0; i < this.blocks.length; ++i) {
			combined.set(new Uint8Array(this.blocks[i].buffer), i << this.blockSize);
		}
		return combined.buffer;
	} else {
		return this.blocks[0].buffer;
	}
};

MemoryProxy.prototype.replace = function(buffer) {
	for (var i = 0; i < this.blocks.length; ++i) {
		this.blocks[i] = new MemoryView(buffer.slice(i << this.blockSize, (i << this.blockSize) + this.blocks[i].buffer.byteLength));
	}
};

MemoryProxy.prototype.load8 = function(offset) {
	return this.blocks[offset >> this.blockSize].load8(offset & this.mask);
};

MemoryProxy.prototype.load16 = function(offset) {
	return this.blocks[offset >> this.blockSize].load16(offset & this.mask);
};

MemoryProxy.prototype.loadU8 = function(offset) {
	return this.blocks[offset >> this.blockSize].loadU8(offset & this.mask);
};

MemoryProxy.prototype.loadU16 = function(offset) {
	return this.blocks[offset >> this.blockSize].loadU16(offset & this.mask);
};

MemoryProxy.prototype.load32 = function(offset) {
	return this.blocks[offset >> this.blockSize].load32(offset & this.mask);
};

MemoryProxy.prototype.store8 = function(offset, value) {
	if (offset >= this.size) {
		return;
	}
	this.owner.memoryDirtied(this, offset >> this.blockSize);
	this.blocks[offset >> this.blockSize].store8(offset & this.mask, value);
	this.blocks[offset >> this.blockSize].store8((offset & this.mask) ^ 1, value);
};

MemoryProxy.prototype.store16 = function(offset, value) {
	if (offset >= this.size) {
		return;
	}
	this.owner.memoryDirtied(this, offset >> this.blockSize);
	return this.blocks[offset >> this.blockSize].store16(offset & this.mask, value);
};

MemoryProxy.prototype.store32 = function(offset, value) {
	if (offset >= this.size) {
		return;
	}
	this.owner.memoryDirtied(this, offset >> this.blockSize);
	return this.blocks[offset >> this.blockSize].store32(offset & this.mask, value);
};

MemoryProxy.prototype.invalidatePage = function(address) {};

function GameBoyAdvanceRenderProxy() {
	this.worker = new Worker('js/video/worker.js');

	this.currentFrame = 0;
	this.delay = 0;
	this.skipFrame = false;

	this.dirty = null;
	var self = this;
	var handlers = {
		finish: function(data) {
			self.backing = data.backing;
			self.caller.finishDraw(self.backing);
			--self.delay;
		}
	};
	this.worker.onmessage = function(message) {
		handlers[message.data['type']](message.data);
	}
};

GameBoyAdvanceRenderProxy.prototype.memoryDirtied = function(mem, block) {
	this.dirty = this.dirty || {};
	this.dirty.memory = this.dirty.memory || {};
	if (mem === this.palette) {
		this.dirty.memory.palette = mem.blocks[0].buffer;
	}
	if (mem === this.oam) {
		this.dirty.memory.oam = mem.blocks[0].buffer;
	}
	if (mem === this.vram) {
		this.dirty.memory.vram = this.dirty.memory.vram || [];
		this.dirty.memory.vram[block] = mem.blocks[block].buffer;
	}
};

GameBoyAdvanceRenderProxy.prototype.clear = function(mmu) {
	this.palette = new MemoryProxy(this, mmu.SIZE_PALETTE_RAM, 0);
	this.vram = new MemoryProxy(this, mmu.SIZE_VRAM, 13);
	this.oam = new MemoryProxy(this, mmu.SIZE_OAM, 0);

	this.dirty = null;
	this.scanlineQueue = [];

	this.worker.postMessage({ type: 'clear', SIZE_VRAM: mmu.SIZE_VRAM, SIZE_OAM: mmu.SIZE_OAM });
};

GameBoyAdvanceRenderProxy.prototype.freeze = function(encodeBase64) {
	return {
		'palette': Serializer.prefix(this.palette.combine()),
		'vram': Serializer.prefix(this.vram.combine()),
		'oam': Serializer.prefix(this.oam.combine())
	};
};

GameBoyAdvanceRenderProxy.prototype.defrost = function(frost, decodeBase64) {
	this.palette.replace(frost.palette);
	this.memoryDirtied(this.palette, 0);
	this.vram.replace(frost.vram);
	for (var i = 0; i < this.vram.blocks.length; ++i) {
		this.memoryDirtied(this.vram, i);
	}
	this.oam.replace(frost.oam);
	this.memoryDirtied(this.oam, 0);
};

GameBoyAdvanceRenderProxy.prototype.writeDisplayControl = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.DISPCNT = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundControl = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGCNT = this.dirty.BGCNT || [];
	this.dirty.BGCNT[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundHOffset = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGHOFS = this.dirty.BGHOFS || [];
	this.dirty.BGHOFS[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundVOffset = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGVOFS = this.dirty.BGVOFS || [];
	this.dirty.BGVOFS[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundRefX = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGX = this.dirty.BGX || [];
	this.dirty.BGX[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundRefY = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGY = this.dirty.BGY || [];
	this.dirty.BGY[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundParamA = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGPA = this.dirty.BGPA || [];
	this.dirty.BGPA[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundParamB = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGPB = this.dirty.BGPB || [];
	this.dirty.BGPB[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundParamC = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGPC = this.dirty.BGPC || [];
	this.dirty.BGPC[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBackgroundParamD = function(bg, value) {
	this.dirty = this.dirty || {};
	this.dirty.BGPD = this.dirty.BGPD || [];
	this.dirty.BGPD[bg] = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWin0H = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WIN0H = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWin1H = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WIN1H = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWin0V = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WIN0V = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWin1V = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WIN1V = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWinIn = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WININ = value;
};

GameBoyAdvanceRenderProxy.prototype.writeWinOut = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.WINOUT = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBlendControl = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.BLDCNT = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBlendAlpha = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.BLDALPHA = value;
};

GameBoyAdvanceRenderProxy.prototype.writeBlendY = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.BLDY = value;
};

GameBoyAdvanceRenderProxy.prototype.writeMosaic = function(value) {
	this.dirty = this.dirty || {};
	this.dirty.MOSAIC = value;
};

GameBoyAdvanceRenderProxy.prototype.clearSubsets = function(mmu, regions) {
	this.dirty = this.dirty || {};
	if (regions & 0x04) {
		this.palette = new MemoryProxy(this, mmu.SIZE_PALETTE_RAM, 0);
		mmu.mmap(mmu.REGION_PALETTE_RAM, this.palette);
		this.memoryDirtied(this.palette, 0);
	}
	if (regions & 0x08) {
		this.vram = new MemoryProxy(this, mmu.SIZE_VRAM, 13);
		mmu.mmap(mmu.REGION_VRAM, this.vram);
		for (var i = 0; i < this.vram.blocks.length; ++i) {
			this.memoryDirtied(this.vram, i);
		}
	}
	if (regions & 0x10) {
		this.oam = new MemoryProxy(this, mmu.SIZE_OAM, 0);
		mmu.mmap(mmu.REGION_OAM, this.oam);
		this.memoryDirtied(this.oam, 0);
	}
};

GameBoyAdvanceRenderProxy.prototype.setBacking = function(backing) {
	this.backing = backing;
	this.worker.postMessage({ type: 'start', backing: this.backing });
};

GameBoyAdvanceRenderProxy.prototype.drawScanline = function(y) {
	if (!this.skipFrame) {
		if (this.dirty) {
			if (this.dirty.memory) {
				if (this.dirty.memory.palette) {
					this.dirty.memory.palette = this.dirty.memory.palette.slice(0);
				}
				if (this.dirty.memory.oam) {
					this.dirty.memory.oam = this.dirty.memory.oam.slice(0);
				}
				if (this.dirty.memory.vram) {
					for (var i = 0; i < 12; ++i) {
						if (this.dirty.memory.vram[i]) {
							this.dirty.memory.vram[i] = this.dirty.memory.vram[i].slice(0);
						}
					}
				}
			}
			this.scanlineQueue.push({ y: y, dirty: this.dirty });
			this.dirty = null;
		}
	}
};

GameBoyAdvanceRenderProxy.prototype.startDraw = function() {
	++this.currentFrame;
	if (this.delay <= 0) {
		this.skipFrame = false;
	}
	if (!this.skipFrame) {
		++this.delay;
	}
};

GameBoyAdvanceRenderProxy.prototype.finishDraw = function(caller) {
	this.caller = caller;
	if (!this.skipFrame) {
		this.worker.postMessage({ type: 'finish', scanlines: this.scanlineQueue, frame: this.currentFrame });
		this.scanlineQueue = [];
		if (this.delay > 2) {
			this.skipFrame = true;
		}
	}
};

function MemoryAligned16(size) {
	this.buffer = new Uint16Array(size >> 1);
};

MemoryAligned16.prototype.load8 = function(offset) {
	return (this.loadU8(offset) << 24) >> 24;
};

MemoryAligned16.prototype.load16 = function(offset) {
	return (this.loadU16(offset) << 16) >> 16;
};

MemoryAligned16.prototype.loadU8 = function(offset) {
	var index = offset >> 1;
	if (offset & 1) {
		return (this.buffer[index] & 0xFF00) >>> 8;
	} else {
		return this.buffer[index] & 0x00FF;
	}
};

MemoryAligned16.prototype.loadU16 = function(offset) {
	return this.buffer[offset >> 1];
};

MemoryAligned16.prototype.load32 = function(offset) {
	return this.buffer[(offset >> 1) & ~1] | (this.buffer[(offset >> 1) | 1] << 16);
};

MemoryAligned16.prototype.store8 = function(offset, value) {
	var index = offset >> 1;
	this.store16(offset, (value << 8) | value);
};

MemoryAligned16.prototype.store16 = function(offset, value) {
	this.buffer[offset >> 1] = value;
};

MemoryAligned16.prototype.store32 = function(offset, value) {
	var index = offset >> 1;
	this.store16(offset, this.buffer[index] = value & 0xFFFF);
	this.store16(offset + 2, this.buffer[index + 1] = value >>> 16);
};

MemoryAligned16.prototype.insert = function(start, data) {
	this.buffer.set(data, start);
};

MemoryAligned16.prototype.invalidatePage = function(address) {};

function GameBoyAdvanceVRAM(size) {
	MemoryAligned16.call(this, size);
	this.vram = this.buffer;
};

GameBoyAdvanceVRAM.prototype = Object.create(MemoryAligned16.prototype);

function GameBoyAdvanceOAM(size) {
	MemoryAligned16.call(this, size);
	this.oam = this.buffer;
	this.objs = new Array(128);
	for (var i = 0; i < 128; ++i) {
		this.objs[i] = new GameBoyAdvanceOBJ(this, i);
	}
	this.scalerot = new Array(32);
	for (var i = 0; i < 32; ++i) {
		this.scalerot[i] = {
			a: 1,
			b: 0,
			c: 0,
			d: 1
		};
	}
};

GameBoyAdvanceOAM.prototype = Object.create(MemoryAligned16.prototype);

GameBoyAdvanceOAM.prototype.overwrite = function(memory) {
	for (var i = 0; i < (this.buffer.byteLength >> 1); ++i) {
		this.store16(i << 1, memory[i]);
	}
};

GameBoyAdvanceOAM.prototype.store16 = function(offset, value) {
	var index = (offset & 0x3F8) >> 3;
	var obj = this.objs[index];
	var scalerot = this.scalerot[index >> 2];
	var layer = obj.priority;
	var disable = obj.disable;
	var y = obj.y;
	switch (offset & 0x00000006) {
	case 0:
		// Attribute 0
		obj.y = value & 0x00FF;
		var wasScalerot = obj.scalerot;
		obj.scalerot = value & 0x0100;
		if (obj.scalerot) {
			obj.scalerotOam = this.scalerot[obj.scalerotParam];
			obj.doublesize = !!(value & 0x0200);
			obj.disable = 0;
			obj.hflip = 0;
			obj.vflip = 0;
		} else {
			obj.doublesize = false;
			obj.disable = value & 0x0200;
			if (wasScalerot) {
				obj.hflip = obj.scalerotParam & 0x0008;
				obj.vflip = obj.scalerotParam & 0x0010;
			}
		}
		obj.mode = (value & 0x0C00) >> 6; // This lines up with the stencil format
		obj.mosaic = value & 0x1000;
		obj.multipalette = value & 0x2000;
		obj.shape = (value & 0xC000) >> 14;

		obj.recalcSize();
		break;
	case 2:
		// Attribute 1
		obj.x = value & 0x01FF;
		if (obj.scalerot) {
			obj.scalerotParam = (value & 0x3E00) >> 9;
			obj.scalerotOam = this.scalerot[obj.scalerotParam];
			obj.hflip = 0;
			obj.vflip = 0;
			obj.drawScanline = obj.drawScanlineAffine;
		} else {
			obj.hflip = value & 0x1000;
			obj.vflip = value & 0x2000;
			obj.drawScanline = obj.drawScanlineNormal;
		}
		obj.size = (value & 0xC000) >> 14;

		obj.recalcSize();
		break;
	case 4:
		// Attribute 2
		obj.tileBase = value & 0x03FF;
		obj.priority = (value & 0x0C00) >> 10;
		obj.palette = (value & 0xF000) >> 8; // This is shifted up 4 to make pushPixel faster
		break;
	case 6:
		// Scaling/rotation parameter
		switch (index & 0x3) {
		case 0:
			scalerot.a = (value << 16) / 0x1000000;
			break;
		case 1:
			scalerot.b = (value << 16) / 0x1000000;
			break;
		case 2:
			scalerot.c = (value << 16) / 0x1000000;
			break;
		case 3:
			scalerot.d = (value << 16) / 0x1000000;
			break;
		}
		break;
	}

	MemoryAligned16.prototype.store16.call(this, offset, value);
};

function GameBoyAdvancePalette() {
	this.colors = [ new Array(0x100), new Array(0x100) ];
	this.adjustedColors = [ new Array(0x100), new Array(0x100) ];
	this.passthroughColors = [
		this.colors[0], // BG0
		this.colors[0], // BG1
		this.colors[0], // BG2
		this.colors[0], // BG3
		this.colors[1], // OBJ
		this.colors[0] // Backdrop
	];
	this.blendY = 1;
};

GameBoyAdvancePalette.prototype.overwrite = function(memory) {
	for (var i = 0; i < 512; ++i) {
		this.store16(i << 1, memory[i]);
	}
};

GameBoyAdvancePalette.prototype.loadU8 = function(offset) {
	return (this.loadU16(offset) >> (8 * (offset & 1))) & 0xFF;
};

GameBoyAdvancePalette.prototype.loadU16 = function(offset) {
	return this.colors[(offset & 0x200) >> 9][(offset & 0x1FF) >> 1];
};

GameBoyAdvancePalette.prototype.load16 = function(offset) {
	return (this.loadU16(offset) << 16) >> 16;
};

GameBoyAdvancePalette.prototype.load32 = function(offset) {
	return this.loadU16(offset) | (this.loadU16(offset + 2) << 16);
};

GameBoyAdvancePalette.prototype.store16 = function(offset, value) {
	var type = (offset & 0x200) >> 9;
	var index = (offset & 0x1FF) >> 1;
	this.colors[type][index] = value;
	this.adjustedColors[type][index] = this.adjustColor(value);
};

GameBoyAdvancePalette.prototype.store32 = function(offset, value) {
	this.store16(offset, value & 0xFFFF);
	this.store16(offset + 2, value >> 16);
};

GameBoyAdvancePalette.prototype.invalidatePage = function(address) {};

GameBoyAdvancePalette.prototype.convert16To32 = function(value, input) {
	var r = (value & 0x001F) << 3;
	var g = (value & 0x03E0) >> 2;
	var b = (value & 0x7C00) >> 7;

	input[0] = r;
	input[1] = g;
	input[2] = b;
};

GameBoyAdvancePalette.prototype.mix = function(aWeight, aColor, bWeight, bColor) {
	var ar = (aColor & 0x001F);
	var ag = (aColor & 0x03E0) >> 5;
	var ab = (aColor & 0x7C00) >> 10;

	var br = (bColor & 0x001F);
	var bg = (bColor & 0x03E0) >> 5;
	var bb = (bColor & 0x7C00) >> 10;

	var r = Math.min(aWeight * ar + bWeight * br, 0x1F);
	var g = Math.min(aWeight * ag + bWeight * bg, 0x1F);
	var b = Math.min(aWeight * ab + bWeight * bb, 0x1F);

	return r | (g << 5) | (b << 10);
};

GameBoyAdvancePalette.prototype.makeDarkPalettes = function(layers) {
	if (this.adjustColor != this.adjustColorDark) {
		this.adjustColor = this.adjustColorDark;
		this.resetPalettes();
	}
	this.resetPaletteLayers(layers);
};

GameBoyAdvancePalette.prototype.makeBrightPalettes = function(layers) {
	if (this.adjustColor != this.adjustColorBright) {
		this.adjustColor = this.adjustColorBright;
		this.resetPalettes();
	}
	this.resetPaletteLayers(layers);
};

GameBoyAdvancePalette.prototype.makeNormalPalettes = function() {
	this.passthroughColors[0] = this.colors[0];
	this.passthroughColors[1] = this.colors[0];
	this.passthroughColors[2] = this.colors[0];
	this.passthroughColors[3] = this.colors[0];
	this.passthroughColors[4] = this.colors[1];
	this.passthroughColors[5] = this.colors[0];
};

GameBoyAdvancePalette.prototype.makeSpecialPalette = function(layer) {
	this.passthroughColors[layer] = this.adjustedColors[layer == 4 ? 1 : 0];
};

GameBoyAdvancePalette.prototype.makeNormalPalette = function(layer) {
	this.passthroughColors[layer] = this.colors[layer == 4 ? 1 : 0];
};

GameBoyAdvancePalette.prototype.resetPaletteLayers = function(layers) {
	if (layers & 0x01) {
		this.passthroughColors[0] = this.adjustedColors[0];
	} else {
		this.passthroughColors[0] = this.colors[0];
	}
	if (layers & 0x02) {
		this.passthroughColors[1] = this.adjustedColors[0];
	} else {
		this.passthroughColors[1] = this.colors[0];
	}
	if (layers & 0x04) {
		this.passthroughColors[2] = this.adjustedColors[0];
	} else {
		this.passthroughColors[2] = this.colors[0];
	}
	if (layers & 0x08) {
		this.passthroughColors[3] = this.adjustedColors[0];
	} else {
		this.passthroughColors[3] = this.colors[0];
	}
	if (layers & 0x10) {
		this.passthroughColors[4] = this.adjustedColors[1];
	} else {
		this.passthroughColors[4] = this.colors[1];
	}
	if (layers & 0x20) {
		this.passthroughColors[5] = this.adjustedColors[0];
	} else {
		this.passthroughColors[5] = this.colors[0];
	}
};

GameBoyAdvancePalette.prototype.resetPalettes = function() {
	var i;
	var outPalette = this.adjustedColors[0];
	var inPalette = this.colors[0];
	for (i = 0; i < 256; ++i) {
		outPalette[i] = this.adjustColor(inPalette[i]);
	}

	outPalette = this.adjustedColors[1];
	inPalette = this.colors[1];
	for (i = 0; i < 256; ++i) {
		outPalette[i] = this.adjustColor(inPalette[i]);
	}
}

GameBoyAdvancePalette.prototype.accessColor = function(layer, index) {
	return this.passthroughColors[layer][index];
};

GameBoyAdvancePalette.prototype.adjustColorDark = function(color) {
	var r = (color & 0x001F);
	var g = (color & 0x03E0) >> 5;
	var b = (color & 0x7C00) >> 10;

	r = r - (r * this.blendY);
	g = g - (g * this.blendY);
	b = b - (b * this.blendY);

	return r | (g << 5) | (b << 10);
};

GameBoyAdvancePalette.prototype.adjustColorBright = function(color) {
	var r = (color & 0x001F);
	var g = (color & 0x03E0) >> 5;
	var b = (color & 0x7C00) >> 10;

	r = r + ((31 - r) * this.blendY);
	g = g + ((31 - g) * this.blendY);
	b = b + ((31 - b) * this.blendY);

	return r | (g << 5) | (b << 10);
};

GameBoyAdvancePalette.prototype.adjustColor = GameBoyAdvancePalette.prototype.adjustColorBright;

GameBoyAdvancePalette.prototype.setBlendY = function(y) {
	if (this.blendY != y) {
		this.blendY = y;
		this.resetPalettes();
	}
};

function GameBoyAdvanceOBJ(oam, index) {
	this.TILE_OFFSET = 0x10000;
	this.oam = oam;

	this.index = index;
	this.x = 0;
	this.y = 0;
	this.scalerot = 0;
	this.doublesize = false;
	this.disable = 1;
	this.mode = 0;
	this.mosaic = false;
	this.multipalette = false;
	this.shape = 0;
	this.scalerotParam = 0;
	this.hflip = 0;
	this.vflip = 0;
	this.tileBase = 0;
	this.priority = 0;
	this.palette = 0;
	this.drawScanline = this.drawScanlineNormal;
	this.pushPixel = GameBoyAdvanceSoftwareRenderer.pushPixel;
	this.cachedWidth = 8;
	this.cachedHeight = 8;
};

GameBoyAdvanceOBJ.prototype.drawScanlineNormal = function(backing, y, yOff, start, end) {
	var video = this.oam.video;
	var x;
	var underflow;
	var offset;
	var mask = this.mode | video.target2[video.LAYER_OBJ] | (this.priority << 1);
	if (this.mode == 0x10) {
		mask |= video.TARGET1_MASK;
	}
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[video.LAYER_OBJ];
	}

	var totalWidth = this.cachedWidth;
	if (this.x < video.HORIZONTAL_PIXELS) {
		if (this.x < start) {
			underflow = start - this.x;
			offset = start;
		} else {
			underflow = 0;
			offset = this.x;
		}
		if (end < this.cachedWidth + this.x) {
			totalWidth = end - this.x;
		}
	} else {
		underflow = start + 512 - this.x;
		offset = start;
		if (end < this.cachedWidth - underflow) {
			totalWidth = end;
		}
	}
	
	var localX;
	var localY;
	if (!this.vflip) {
		localY = y - yOff;
	} else {
		localY = this.cachedHeight - y + yOff - 1;
	}
	var localYLo = localY & 0x7;
	var mosaicX;
	var tileOffset;

	var paletteShift = this.multipalette ? 1 : 0;

	if (video.objCharacterMapping) {
		tileOffset = ((localY & 0x01F8) * this.cachedWidth) >> 6;
	} else {
		tileOffset = (localY & 0x01F8) << (2 - paletteShift);
	}

	if (this.mosaic) {
		mosaicX = video.objMosaicX - 1 - (video.objMosaicX + offset - 1) % video.objMosaicX;
		offset += mosaicX;
		underflow += mosaicX;
	}
	if (!this.hflip) {
		localX = underflow;
	} else {
		localX = this.cachedWidth - underflow - 1;
	}

	var tileRow = video.accessTile(this.TILE_OFFSET + (x & 0x4) * paletteShift, this.tileBase + (tileOffset << paletteShift) + ((localX & 0x01F8) >> (3 - paletteShift)), localYLo << paletteShift);
	for (x = underflow; x < totalWidth; ++x) {
		mosaicX = this.mosaic ? offset % video.objMosaicX : 0;
		if (!this.hflip) {
			localX = x - mosaicX;
		} else {
			localX = this.cachedWidth - (x - mosaicX) - 1;
		}
		if (!paletteShift) {
			if (!(x & 0x7) || (this.mosaic && !mosaicX)) {
				tileRow = video.accessTile(this.TILE_OFFSET, this.tileBase + tileOffset + (localX >> 3), localYLo);
			}
		} else {
			if (!(x & 0x3) || (this.mosaic && !mosaicX)) {
				tileRow = video.accessTile(this.TILE_OFFSET + (localX & 0x4), this.tileBase + (tileOffset << 1) + ((localX & 0x01F8) >> 2), localYLo << 1);
			}
		}
		this.pushPixel(video.LAYER_OBJ, this, video, tileRow, localX & 0x7, offset, backing, mask, false);
		offset++;
	}
};

GameBoyAdvanceOBJ.prototype.drawScanlineAffine = function(backing, y, yOff, start, end) {
	var video = this.oam.video;
	var x;
	var underflow;
	var offset;
	var mask = this.mode | video.target2[video.LAYER_OBJ] | (this.priority << 1);
	if (this.mode == 0x10) {
		mask |= video.TARGET1_MASK;
	}
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[video.LAYER_OBJ];
	}

	var localX;
	var localY;
	var yDiff = y - yOff;
	var tileOffset;

	var paletteShift = this.multipalette ? 1 : 0;
	var totalWidth = this.cachedWidth << this.doublesize;
	var totalHeight = this.cachedHeight << this.doublesize;
	var drawWidth = totalWidth;
	if (drawWidth > video.HORIZONTAL_PIXELS) {
		totalWidth = video.HORIZONTAL_PIXELS;
	}

	if (this.x < video.HORIZONTAL_PIXELS) {
		if (this.x < start) {
			underflow = start - this.x;
			offset = start;
		} else {
			underflow = 0;
			offset = this.x;
		}
		if (end < drawWidth + this.x) {
			drawWidth = end - this.x;
		}
	} else {
		underflow = start + 512 - this.x;
		offset = start;
		if (end < drawWidth - underflow) {
			drawWidth = end;
		}
	}

	for (x = underflow; x < drawWidth; ++x) {
		localX = this.scalerotOam.a * (x - (totalWidth >> 1)) + this.scalerotOam.b * (yDiff - (totalHeight >> 1)) + (this.cachedWidth >> 1);
		localY = this.scalerotOam.c * (x - (totalWidth >> 1)) + this.scalerotOam.d * (yDiff - (totalHeight >> 1)) + (this.cachedHeight >> 1);
		if (this.mosaic) {
			localX -= (x % video.objMosaicX) * this.scalerotOam.a + (y % video.objMosaicY) * this.scalerotOam.b;
			localY -= (x % video.objMosaicX) * this.scalerotOam.c + (y % video.objMosaicY) * this.scalerotOam.d;
		}

		if (localX < 0 || localX >= this.cachedWidth || localY < 0 || localY >= this.cachedHeight) {
			offset++;
			continue;
		}

		if (video.objCharacterMapping) {
			tileOffset = ((localY & 0x01F8) * this.cachedWidth) >> 6;
		} else {
			tileOffset = (localY & 0x01F8) << (2 - paletteShift);
		}
		tileRow = video.accessTile(this.TILE_OFFSET + (localX & 0x4) * paletteShift, this.tileBase + (tileOffset << paletteShift) + ((localX & 0x01F8) >> (3 - paletteShift)), (localY & 0x7) << paletteShift);
		this.pushPixel(video.LAYER_OBJ, this, video, tileRow, localX & 0x7, offset, backing, mask, false);
		offset++;
	}
};

GameBoyAdvanceOBJ.prototype.recalcSize = function() {
	switch (this.shape) {
	case 0:
		// Square
		this.cachedHeight = this.cachedWidth = 8 << this.size;
		break;
	case 1:
		// Horizontal
		switch (this.size) {
		case 0:
			this.cachedHeight = 8;
			this.cachedWidth = 16;
			break;
		case 1:
			this.cachedHeight = 8;
			this.cachedWidth = 32;
			break;
		case 2:
			this.cachedHeight = 16;
			this.cachedWidth = 32;
			break;
		case 3:
			this.cachedHeight = 32;
			this.cachedWidth = 64;
			break;
		}
		break;
	case 2:
		// Vertical
		switch (this.size) {
		case 0:
			this.cachedHeight = 16;
			this.cachedWidth = 8;
			break;
		case 1:
			this.cachedHeight = 32;
			this.cachedWidth = 8;
			break;
		case 2:
			this.cachedHeight = 32;
			this.cachedWidth = 16;
			break;
		case 3:
			this.cachedHeight = 64;
			this.cachedWidth = 32;
			break;
		}
		break;
	default:
		// Bad!
	}
};

function GameBoyAdvanceOBJLayer(video, index) {
	this.video = video;
	this.bg = false;
	this.index = video.LAYER_OBJ;
	this.priority = index;
	this.enabled = false;
	this.objwin = 0;
};

GameBoyAdvanceOBJLayer.prototype.drawScanline = function(backing, layer, start, end) {
	var y = this.video.vcount;
	var wrappedY;
	var mosaicY;
	var obj;
	if (start >= end) {
		return;
	}
	var objs = this.video.oam.objs;
	for (var i = 0; i < objs.length; ++i) {
		obj = objs[i];
		if (obj.disable) {
			continue;
		}
		if ((obj.mode & this.video.OBJWIN_MASK) != this.objwin) {
			continue;
		}
		if (!(obj.mode & this.video.OBJWIN_MASK) && this.priority != obj.priority) {
			continue;
		}
		if (obj.y < this.video.VERTICAL_PIXELS) {
			wrappedY = obj.y;
		} else {
			wrappedY = obj.y - 256;
		}
		var totalHeight;
		if (!obj.scalerot) {
			totalHeight = obj.cachedHeight;
		} else {
			totalHeight = obj.cachedHeight << obj.doublesize;
		}
		if (!obj.mosaic) {
			mosaicY = y;
		} else {
			mosaicY = y - y % this.video.objMosaicY;
		}
		if (wrappedY <= y && (wrappedY + totalHeight) > y) {
			obj.drawScanline(backing, mosaicY, wrappedY, start, end);
		}
	}
};

GameBoyAdvanceOBJLayer.prototype.objComparator = function(a, b) {
	return a.index - b.index;
};

function GameBoyAdvanceSoftwareRenderer() {
	this.LAYER_BG0 = 0;
	this.LAYER_BG1 = 1;
	this.LAYER_BG2 = 2;
	this.LAYER_BG3 = 3;
	this.LAYER_OBJ = 4;
	this.LAYER_BACKDROP = 5;

	this.HORIZONTAL_PIXELS = 240;
	this.VERTICAL_PIXELS = 160;

	this.LAYER_MASK = 0x06;
	this.BACKGROUND_MASK = 0x01;
	this.TARGET2_MASK = 0x08;
	this.TARGET1_MASK = 0x10;
	this.OBJWIN_MASK = 0x20;
	this.WRITTEN_MASK = 0x80;

	this.PRIORITY_MASK = this.LAYER_MASK | this.BACKGROUND_MASK;

	this.drawBackdrop = new (function(video) {
		this.bg = true;
		this.priority = -1;
		this.index = video.LAYER_BACKDROP;
		this.enabled = true;

		this.drawScanline = function(backing, layer, start, end) {
			// TODO: interactions with blend modes and OBJWIN
			for (var x = start; x < end; ++x) {
				if (!(backing.stencil[x] & video.WRITTEN_MASK)) {
					backing.color[x] = video.palette.accessColor(this.index, 0);
					backing.stencil[x] = video.WRITTEN_MASK;
				} else if (backing.stencil[x] & video.TARGET1_MASK) {
					backing.color[x] = video.palette.mix(video.blendB, video.palette.accessColor(this.index, 0), video.blendA, backing.color[x]);
					backing.stencil[x] = video.WRITTEN_MASK;
				}
			}
		}
	})(this);
};

GameBoyAdvanceSoftwareRenderer.prototype.clear = function(mmu) {
	this.palette = new GameBoyAdvancePalette();
	this.vram = new GameBoyAdvanceVRAM(mmu.SIZE_VRAM);
	this.oam = new GameBoyAdvanceOAM(mmu.SIZE_OAM);
	this.oam.video = this;
	this.objLayers = [
		new GameBoyAdvanceOBJLayer(this, 0),
		new GameBoyAdvanceOBJLayer(this, 1),
		new GameBoyAdvanceOBJLayer(this, 2),
		new GameBoyAdvanceOBJLayer(this, 3)
	];
	this.objwinLayer = new GameBoyAdvanceOBJLayer(this, 4);
	this.objwinLayer.objwin = this.OBJWIN_MASK;

	// DISPCNT
	this.backgroundMode = 0;
	this.displayFrameSelect = 0;
	this.hblankIntervalFree = 0;
	this.objCharacterMapping = 0;
	this.forcedBlank = 1;
	this.win0 = 0;
	this.win1 = 0;
	this.objwin = 0;

	// VCOUNT
	this.vcount = -1;

	// WIN0H
	this.win0Left = 0;
	this.win0Right = 240;

	// WIN1H
	this.win1Left = 0;
	this.win1Right = 240;

	// WIN0V
	this.win0Top = 0;
	this.win0Bottom = 160;

	// WIN1V
	this.win1Top = 0;
	this.win1Bottom = 160;

	// WININ/WINOUT
	this.windows = new Array();
	for (var i = 0; i < 4; ++i) {
		this.windows.push({
			enabled: [ false, false, false, false, false, true ],
			special: 0
		});
	};

	// BLDCNT
	this.target1 = new Array(5);
	this.target2 = new Array(5);
	this.blendMode = 0;

	// BLDALPHA
	this.blendA = 0;
	this.blendB = 0;

	// BLDY
	this.blendY = 0;

	// MOSAIC
	this.bgMosaicX = 1;
	this.bgMosaicY = 1;
	this.objMosaicX = 1;
	this.objMosaicY = 1;

	this.lastHblank = 0;
	this.nextHblank = this.HDRAW_LENGTH;
	this.nextEvent = this.nextHblank;

	this.nextHblankIRQ = 0;
	this.nextVblankIRQ = 0;
	this.nextVcounterIRQ = 0;

	this.bg = new Array();
	for (var i = 0; i < 4; ++i) {
		this.bg.push({
			bg: true,
			index: i,
			enabled: false,
			video: this,
			vram: this.vram,
			priority: 0,
			charBase: 0,
			mosaic: false,
			multipalette: false,
			screenBase: 0,
			overflow: 0,
			size: 0,
			x: 0,
			y: 0,
			refx: 0,
			refy: 0,
			dx: 1,
			dmx: 0,
			dy: 0,
			dmy: 1,
			sx: 0,
			sy: 0,
			pushPixel: GameBoyAdvanceSoftwareRenderer.pushPixel,
			drawScanline: this.drawScanlineBGMode0
		});
	}

	this.bgModes = [
		this.drawScanlineBGMode0,
		this.drawScanlineBGMode2, // Modes 1 and 2 are identical for layers 2 and 3
		this.drawScanlineBGMode2,
		this.drawScanlineBGMode3,
		this.drawScanlineBGMode4,
		this.drawScanlineBGMode5
	];

	this.drawLayers = [
		this.bg[0],
		this.bg[1],
		this.bg[2],
		this.bg[3],
		this.objLayers[0],
		this.objLayers[1],
		this.objLayers[2],
		this.objLayers[3],
		this.objwinLayer,
		this.drawBackdrop
	];

	this,objwinActive = false;
	this.alphaEnabled = false;

	this.scanline = {
		color: new Uint16Array(this.HORIZONTAL_PIXELS),
		// Stencil format:
		// Bits 0-1: Layer
		// Bit 2: Is background
		// Bit 3: Is Target 2
		// Bit 4: Is Target 1
		// Bit 5: Is OBJ Window
		// Bit 6: Reserved
		// Bit 7: Has been written
		stencil: new Uint8Array(this.HORIZONTAL_PIXELS)
	};
	this.sharedColor = [ 0, 0, 0 ];
	this.sharedMap = {
		tile: 0,
		hflip: false,
		vflip: false,
		palette: 0
	};
};

GameBoyAdvanceSoftwareRenderer.prototype.clearSubsets = function(mmu, regions) {
	if (regions & 0x04) {
		this.palette.overwrite(new Uint16Array(mmu.SIZE_PALETTE >> 1));
	}

	if (regions & 0x08) {
		this.vram.insert(0, new Uint16Array(mmu.SIZE_VRAM >> 1));
	}

	if (regions & 0x10) {
		this.oam.overwrite(new Uint16Array(mmu.SIZE_OAM >> 1));
		this.oam.video = this;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.freeze = function() {
};

GameBoyAdvanceSoftwareRenderer.prototype.defrost = function(frost) {
};

GameBoyAdvanceSoftwareRenderer.prototype.setBacking = function(backing) {
	this.pixelData = backing;

	// Clear backing first
	for (var offset = 0; offset < this.HORIZONTAL_PIXELS * this.VERTICAL_PIXELS * 4;) {
		this.pixelData.data[offset++] = 0xFF;
		this.pixelData.data[offset++] = 0xFF;
		this.pixelData.data[offset++] = 0xFF;
		this.pixelData.data[offset++] = 0xFF;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeDisplayControl = function(value) {
	this.backgroundMode = value & 0x0007;
	this.displayFrameSelect = value & 0x0010;
	this.hblankIntervalFree = value & 0x0020;
	this.objCharacterMapping = value & 0x0040;
	this.forcedBlank = value & 0x0080;
	this.bg[0].enabled = value & 0x0100;
	this.bg[1].enabled = value & 0x0200;
	this.bg[2].enabled = value & 0x0400;
	this.bg[3].enabled = value & 0x0800;
	this.objLayers[0].enabled = value & 0x1000;
	this.objLayers[1].enabled = value & 0x1000;
	this.objLayers[2].enabled = value & 0x1000;
	this.objLayers[3].enabled = value & 0x1000;
	this.win0 = value & 0x2000;
	this.win1 = value & 0x4000;
	this.objwin = value & 0x8000;
	this.objwinLayer.enabled = value & 0x1000 && value & 0x8000;

	// Total hack so we can store both things that would set it to 256-color mode in the same variable
	this.bg[2].multipalette &= ~0x0001;
	this.bg[3].multipalette &= ~0x0001;
	if (this.backgroundMode > 0) {
		this.bg[2].multipalette |= 0x0001;
	}
	if (this.backgroundMode == 2) {
		this.bg[3].multipalette |= 0x0001;
	}
	
	this.resetLayers();
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundControl = function(bg, value) {
	var bgData = this.bg[bg];
	bgData.priority = value & 0x0003;
	bgData.charBase = (value & 0x000C) << 12;
	bgData.mosaic = value & 0x0040;
	bgData.multipalette &= ~0x0080;
	if (bg < 2 || this.backgroundMode == 0) {
		bgData.multipalette |= value & 0x0080;
	}
	bgData.screenBase = (value & 0x1F00) << 3;
	bgData.overflow = value & 0x2000;
	bgData.size = (value & 0xC000) >> 14;

	this.drawLayers.sort(this.layerComparator);
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundHOffset = function(bg, value) {
	this.bg[bg].x = value & 0x1FF;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundVOffset = function(bg, value) {
	this.bg[bg].y = value & 0x1FF;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundRefX = function(bg, value) {
	this.bg[bg].refx = (value << 4) / 0x1000;
	this.bg[bg].sx = this.bg[bg].refx;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundRefY = function(bg, value) {
	this.bg[bg].refy = (value << 4) / 0x1000;
	this.bg[bg].sy = this.bg[bg].refy;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundParamA = function(bg, value) {
	this.bg[bg].dx = (value << 16) / 0x1000000;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundParamB = function(bg, value) {
	this.bg[bg].dmx = (value << 16) / 0x1000000;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundParamC = function(bg, value) {
	this.bg[bg].dy = (value << 16) / 0x1000000;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBackgroundParamD = function(bg, value) {
	this.bg[bg].dmy = (value << 16) / 0x1000000;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWin0H = function(value) {
	this.win0Left = (value & 0xFF00) >> 8;
	this.win0Right = Math.min(this.HORIZONTAL_PIXELS, value & 0x00FF);
	if (this.win0Left > this.win0Right) {
		this.win0Right = this.HORIZONTAL_PIXELS;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWin1H = function(value) {
	this.win1Left = (value & 0xFF00) >> 8;
	this.win1Right = Math.min(this.HORIZONTAL_PIXELS, value & 0x00FF);
	if (this.win1Left > this.win1Right) {
		this.win1Right = this.HORIZONTAL_PIXELS;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWin0V = function(value) {
	this.win0Top = (value & 0xFF00) >> 8;
	this.win0Bottom = Math.min(this.VERTICAL_PIXELS, value & 0x00FF);
	if (this.win0Top > this.win0Bottom) {
		this.win0Bottom = this.VERTICAL_PIXELS;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWin1V = function(value) {
	this.win1Top = (value & 0xFF00) >> 8;
	this.win1Bottom = Math.min(this.VERTICAL_PIXELS, value & 0x00FF);
	if (this.win1Top > this.win1Bottom) {
		this.win1Bottom = this.VERTICAL_PIXELS;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWindow = function(index, value) {
	var window = this.windows[index];
	window.enabled[0] = value & 0x01;
	window.enabled[1] = value & 0x02;
	window.enabled[2] = value & 0x04;
	window.enabled[3] = value & 0x08;
	window.enabled[4] = value & 0x10;
	window.special = value & 0x20;
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWinIn = function(value) {
	this.writeWindow(0, value);
	this.writeWindow(1, value >> 8);
};

GameBoyAdvanceSoftwareRenderer.prototype.writeWinOut = function(value) {
	this.writeWindow(2, value);
	this.writeWindow(3, value >> 8);
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBlendControl = function(value) {
	this.target1[0] = !!(value & 0x0001) * this.TARGET1_MASK;
	this.target1[1] = !!(value & 0x0002) * this.TARGET1_MASK;
	this.target1[2] = !!(value & 0x0004) * this.TARGET1_MASK;
	this.target1[3] = !!(value & 0x0008) * this.TARGET1_MASK;
	this.target1[4] = !!(value & 0x0010) * this.TARGET1_MASK;
	this.target1[5] = !!(value & 0x0020) * this.TARGET1_MASK;
	this.target2[0] = !!(value & 0x0100) * this.TARGET2_MASK;
	this.target2[1] = !!(value & 0x0200) * this.TARGET2_MASK;
	this.target2[2] = !!(value & 0x0400) * this.TARGET2_MASK;
	this.target2[3] = !!(value & 0x0800) * this.TARGET2_MASK;
	this.target2[4] = !!(value & 0x1000) * this.TARGET2_MASK;
	this.target2[5] = !!(value & 0x2000) * this.TARGET2_MASK;
	this.blendMode = (value & 0x00C0) >> 6;

	switch (this.blendMode) {
	case 1:
		// Alpha
		// Fall through
	case 0:
		// Normal
		this.palette.makeNormalPalettes();
		break;
	case 2:
		// Brighter
		this.palette.makeBrightPalettes(value & 0x3F);
		break;
	case 3:
		// Darker
		this.palette.makeDarkPalettes(value & 0x3F);
		break;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.setBlendEnabled = function(layer, enabled, override) {
	this.alphaEnabled = enabled && override == 1;
	if (enabled) {
		switch (override) {
		case 1:
			// Alpha
			// Fall through
		case 0:
			// Normal
			this.palette.makeNormalPalette(layer);
			break;
		case 2:
			// Brighter
		case 3:
			// Darker
			this.palette.makeSpecialPalette(layer);
			break;
		}
	} else {
		this.palette.makeNormalPalette(layer);
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBlendAlpha = function(value) {
	this.blendA = (value & 0x001F) / 16;
	if (this.blendA > 1) {
		this.blendA = 1;
	}
	this.blendB = ((value & 0x1F00) >> 8) / 16;
	if (this.blendB > 1) {
		this.blendB = 1;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.writeBlendY = function(value) {
	this.blendY = value;
	this.palette.setBlendY(value >= 16 ? 1 : (value / 16));
};

GameBoyAdvanceSoftwareRenderer.prototype.writeMosaic = function(value) {
	this.bgMosaicX = (value & 0xF) + 1;
	this.bgMosaicY = ((value >> 4) & 0xF) + 1;
	this.objMosaicX = ((value >> 8) & 0xF) + 1;
	this.objMosaicY = ((value >> 12) & 0xF) + 1;
};

GameBoyAdvanceSoftwareRenderer.prototype.resetLayers = function() {
	if (this.backgroundMode > 1) {
		this.bg[0].enabled = false;
		this.bg[1].enabled = false;
	}
	if (this.bg[2].enabled) {
		this.bg[2].drawScanline = this.bgModes[this.backgroundMode];
	}
	if ((this.backgroundMode == 0 || this.backgroundMode == 2)) {
		if (this.bg[3].enabled) {
			this.bg[3].drawScanline = this.bgModes[this.backgroundMode];
		}
	} else {
		this.bg[3].enabled = false;
	}
	this.drawLayers.sort(this.layerComparator);
};

GameBoyAdvanceSoftwareRenderer.prototype.layerComparator = function(a, b) {
	var diff = b.priority - a.priority;
	if (!diff) {
		if (a.bg && !b.bg) {
			return -1;
		} else if (!a.bg && b.bg) {
			return 1;
		}

		return b.index - a.index;
	}
	return diff;
};

GameBoyAdvanceSoftwareRenderer.prototype.accessMapMode0 = function(base, size, x, yBase, out) {
	var offset = base + ((x >> 2) & 0x3E) + yBase;

	if (size & 1) {
		offset += (x & 0x100) << 3;
	}

	var mem = this.vram.loadU16(offset);
	out.tile = mem & 0x03FF;
	out.hflip = mem & 0x0400;
	out.vflip = mem & 0x0800;
	out.palette = (mem & 0xF000) >> 8 // This is shifted up 4 to make pushPixel faster
};

GameBoyAdvanceSoftwareRenderer.prototype.accessMapMode1 = function(base, size, x, yBase, out) {
	var offset = base + (x >> 3) + yBase;

	out.tile = this.vram.loadU8(offset);
};

GameBoyAdvanceSoftwareRenderer.prototype.accessTile = function(base, tile, y) {
	var offset = base + (tile << 5);
	offset |= y << 2;

	return this.vram.load32(offset);
}

GameBoyAdvanceSoftwareRenderer.pushPixel = function(layer, map, video, row, x, offset, backing, mask, raw) {
	var index;
	if (!raw) {
		if (this.multipalette) {
			index = (row >> (x << 3)) & 0xFF;
		} else {
			index = (row >> (x << 2)) & 0xF;
		}
		// Index 0 is transparent
		if (!index) {
			return;
		} else if (!this.multipalette) {
			index |= map.palette;
		}
	}

	var stencil = video.WRITTEN_MASK;
	var oldStencil = backing.stencil[offset];
	var blend = video.blendMode;
	if (video.objwinActive) {
		if (oldStencil & video.OBJWIN_MASK) {
			if (video.windows[3].enabled[layer]) {
				video.setBlendEnabled(layer, video.windows[3].special && video.target1[layer], blend);
				if (video.windows[3].special && video.alphaEnabled) {
					mask |= video.target1[layer];
				}
				stencil |= video.OBJWIN_MASK;
			} else {
				return;
			}
		} else if (video.windows[2].enabled[layer]) {
			video.setBlendEnabled(layer, video.windows[2].special && video.target1[layer], blend);
			if (video.windows[2].special && video.alphaEnabled) {
				mask |= video.target1[layer];
			}
		} else {
			return;
		}
	}

	if ((mask & video.TARGET1_MASK) && (oldStencil & video.TARGET2_MASK)) {
		video.setBlendEnabled(layer, true, 1);
	}

	var pixel = raw ? row : video.palette.accessColor(layer, index);

	if (mask & video.TARGET1_MASK) {
		video.setBlendEnabled(layer, !!blend, blend);
	}
	var highPriority = (mask & video.PRIORITY_MASK) < (oldStencil & video.PRIORITY_MASK);
	// Backgrounds can draw over each other, too.
	if ((mask & video.PRIORITY_MASK) == (oldStencil & video.PRIORITY_MASK)) {
		highPriority = mask & video.BACKGROUND_MASK;
	}

	if (!(oldStencil & video.WRITTEN_MASK)) {
		// Nothing here yet, just continue
		stencil |= mask;
	} else if (highPriority) {
		// We are higher priority
		if (mask & video.TARGET1_MASK && oldStencil & video.TARGET2_MASK) {
			pixel = video.palette.mix(video.blendA, pixel, video.blendB, backing.color[offset]);
		}
		// We just drew over something, so it doesn't make sense for us to be a TARGET1 anymore...
		stencil |= mask & ~video.TARGET1_MASK;
	} else if ((mask & video.PRIORITY_MASK) > (oldStencil & video.PRIORITY_MASK)) {
		// We're below another layer, but might be the blend target for it
		stencil = oldStencil & ~(video.TARGET1_MASK | video.TARGET2_MASK);
		if (mask & video.TARGET2_MASK && oldStencil & video.TARGET1_MASK) {
			pixel = video.palette.mix(video.blendB, pixel, video.blendA, backing.color[offset]);
		} else {
			return;
		}
	} else {
		return;
	}

	if (mask & video.OBJWIN_MASK) {
		// We ARE the object window, don't draw pixels!
		backing.stencil[offset] |= video.OBJWIN_MASK;
		return;
	}
	backing.color[offset] = pixel;
	backing.stencil[offset] = stencil;
};

GameBoyAdvanceSoftwareRenderer.prototype.identity = function(x) {
	return x;
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBlank = function(backing) {
	for (var x = 0; x < this.HORIZONTAL_PIXELS; ++x) {
		backing.color[x] = 0xFFFF;
		backing.stencil[x] = 0;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.prepareScanline = function(backing) {
	for (var x = 0; x < this.HORIZONTAL_PIXELS; ++x) {
		backing.stencil[x] = this.target2[this.LAYER_BACKDROP];
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBGMode0 = function(backing, bg, start, end) {
	var video = this.video;
	var x;
	var y = video.vcount;
	var offset = start;
	var xOff = bg.x;
	var yOff = bg.y;
	var localX;
	var localXLo;
	var localY = y + yOff;
	if (this.mosaic) {
		localY -= y % video.bgMosaicY;
	}
	var localYLo = localY & 0x7;
	var mosaicX;
	var screenBase = bg.screenBase;
	var charBase = bg.charBase;
	var size = bg.size;
	var index = bg.index;
	var map = video.sharedMap;
	var paletteShift = bg.multipalette ? 1 : 0;
	var mask = video.target2[index] | (bg.priority << 1) | video.BACKGROUND_MASK;
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[index];
	}

	var yBase = (localY << 3) & 0x7C0;
	if (size == 2) {
		yBase += (localY << 3) & 0x800;
	} else if (size == 3) {
		yBase += (localY << 4) & 0x1000;
	}

	var xMask;
	if (size & 1) {
		xMask = 0x1FF;
	} else {
		xMask = 0xFF;
	}

	video.accessMapMode0(screenBase, size, (start + xOff) & xMask, yBase, map);
	var tileRow = video.accessTile(charBase, map.tile << paletteShift, (!map.vflip ? localYLo : 7 - localYLo) << paletteShift);
	for (x = start; x < end; ++x) {
		localX = (x + xOff) & xMask;
		mosaicX = this.mosaic ? offset % video.bgMosaicX : 0;
		localX -= mosaicX;
		localXLo = localX & 0x7;
		if (!paletteShift) {
			if (!localXLo || (this.mosaic && !mosaicX)) {
				video.accessMapMode0(screenBase, size, localX, yBase, map);
				tileRow = video.accessTile(charBase, map.tile, !map.vflip ? localYLo : 7 - localYLo);
				if (!tileRow && !localXLo) {
					x += 7;
					offset += 8;
					continue;
				}
			}
		} else {
			if (!localXLo || (this.mosaic && !mosaicX)) {
				video.accessMapMode0(screenBase, size, localX, yBase, map);
			}
			if (!(localXLo & 0x3) || (this.mosaic && !mosaicX)) {
				tileRow = video.accessTile(charBase + (!!(localX & 0x4) == !map.hflip ? 4 : 0), map.tile << 1, (!map.vflip ? localYLo : 7 - localYLo) << 1);
				if (!tileRow && !(localXLo & 0x3)) {
					x += 3;
					offset += 4;
					continue;
				}
			}
		}
		if (map.hflip) {
			localXLo = 7 - localXLo;
		}
		bg.pushPixel(index, map, video, tileRow, localXLo, offset, backing, mask, false);
		offset++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBGMode2 = function(backing, bg, start, end) {
	var video = this.video;
	var x;
	var y = video.vcount;
	var offset = start;
	var localX;
	var localY;
	var screenBase = bg.screenBase;
	var charBase = bg.charBase;
	var size = bg.size;
	var sizeAdjusted = 128 << size;
	var index = bg.index;
	var map = video.sharedMap;
	var color;
	var mask = video.target2[index] | (bg.priority << 1) | video.BACKGROUND_MASK;
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[index];
	}

	var yBase;

	for (x = start; x < end; ++x) {
		localX = bg.dx * x + bg.sx;
		localY = bg.dy * x + bg.sy;
		if (this.mosaic) {
			localX -= (x % video.bgMosaicX) * bg.dx + (y % video.bgMosaicY) * bg.dmx;
			localY -= (x % video.bgMosaicX) * bg.dy + (y % video.bgMosaicY) * bg.dmy;
		}
		if (bg.overflow) {
			localX &= sizeAdjusted - 1;
			if (localX < 0) {
				localX += sizeAdjusted;
			}
			localY &= sizeAdjusted - 1;
			if (localY < 0) {
				localY += sizeAdjusted;
			}
		} else if (localX < 0 || localY < 0 || localX >= sizeAdjusted || localY >= sizeAdjusted) {
			offset++;
			continue;
		}
		yBase = ((localY << 1) & 0x7F0) << size;
		video.accessMapMode1(screenBase, size, localX, yBase, map);
		color = this.vram.loadU8(charBase + (map.tile << 6) + ((localY & 0x7) << 3) + (localX & 0x7));
		bg.pushPixel(index, map, video, color, 0, offset, backing, mask, false);
		offset++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBGMode3 = function(backing, bg, start, end) {
	var video = this.video;
	var x;
	var y = video.vcount;
	var offset = start;
	var localX;
	var localY;
	var index = bg.index;
	var map = video.sharedMap;
	var color;
	var mask = video.target2[index] | (bg.priority << 1) | video.BACKGROUND_MASK;
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[index];
	}

	var yBase;

	for (x = start; x < end; ++x) {
		localX = bg.dx * x + bg.sx;
		localY = bg.dy * x + bg.sy;
		if (this.mosaic) {
			localX -= (x % video.bgMosaicX) * bg.dx + (y % video.bgMosaicY) * bg.dmx;
			localY -= (x % video.bgMosaicX) * bg.dy + (y % video.bgMosaicY) * bg.dmy;
		}
		if (localX < 0 || localY < 0 || localX >= video.HORIZONTAL_PIXELS || localY >= video.VERTICAL_PIXELS) {
			offset++;
			continue;
		}
		color = this.vram.loadU16(((localY * video.HORIZONTAL_PIXELS) + localX) << 1);
		bg.pushPixel(index, map, video, color, 0, offset, backing, mask, true);
		offset++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBGMode4 = function(backing, bg, start, end) {
	var video = this.video;
	var x;
	var y = video.vcount;
	var offset = start;
	var localX;
	var localY;
	var charBase = 0;
	if (video.displayFrameSelect) {
		charBase += 0xA000;
	}
	var size = bg.size;
	var index = bg.index;
	var map = video.sharedMap;
	var color;
	var mask = video.target2[index] | (bg.priority << 1) | video.BACKGROUND_MASK;
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[index];
	}

	var yBase;

	for (x = start; x < end; ++x) {
		localX = bg.dx * x + bg.sx;
		localY = 0 | bg.dy * x + bg.sy;
		if (this.mosaic) {
			localX -= (x % video.bgMosaicX) * bg.dx + (y % video.bgMosaicY) * bg.dmx;
			localY -= (x % video.bgMosaicX) * bg.dy + (y % video.bgMosaicY) * bg.dmy;
		}
		yBase = (localY << 2) & 0x7E0;
		if (localX < 0 || localY < 0 || localX >= video.HORIZONTAL_PIXELS || localY >= video.VERTICAL_PIXELS) {
			offset++;
			continue;
		}
		color = this.vram.loadU8(charBase + (localY * video.HORIZONTAL_PIXELS) + localX);
		bg.pushPixel(index, map, video, color, 0, offset, backing, mask, false);
		offset++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanlineBGMode5 = function(backing, bg, start, end) {
	var video = this.video;
	var x;
	var y = video.vcount;
	var offset = start;
	var localX;
	var localY;
	var charBase = 0;
	if (video.displayFrameSelect) {
		charBase += 0xA000;
	}
	var index = bg.index;
	var map = video.sharedMap;
	var color;
	var mask = video.target2[index] | (bg.priority << 1) | video.BACKGROUND_MASK;
	if (video.blendMode == 1 && video.alphaEnabled) {
		mask |= video.target1[index];
	}

	var yBase;

	for (x = start; x < end; ++x) {
		localX = bg.dx * x + bg.sx;
		localY = bg.dy * x + bg.sy;
		if (this.mosaic) {
			localX -= (x % video.bgMosaicX) * bg.dx + (y % video.bgMosaicY) * bg.dmx;
			localY -= (x % video.bgMosaicX) * bg.dy + (y % video.bgMosaicY) * bg.dmy;
		}
		if (localX < 0 || localY < 0 || localX >= 160 || localY >= 128) {
			offset++;
			continue;
		}
		color = this.vram.loadU16(charBase + ((localY * 160) + localX) << 1);
		bg.pushPixel(index, map, video, color, 0, offset, backing, mask, true);
		offset++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.drawScanline = function(y) {
	var backing = this.scanline;
	if (this.forcedBlank) {
		this.drawScanlineBlank(backing);
		return;
	}
	this.prepareScanline(backing);
	var layer;
	var firstStart;
	var firstEnd;
	var lastStart;
	var lastEnd;
	this.vcount = y;
	// Draw lower priority first and then draw over them
	for (var i = 0; i < this.drawLayers.length; ++i) {
		layer = this.drawLayers[i];
		if (!layer.enabled) {
			continue;
		}
		this.objwinActive = false;
		if (!(this.win0 || this.win1 || this.objwin)) {
			this.setBlendEnabled(layer.index, this.target1[layer.index], this.blendMode);
			layer.drawScanline(backing, layer, 0, this.HORIZONTAL_PIXELS);
		} else {
			firstStart = 0;
			firstEnd = this.HORIZONTAL_PIXELS;
			lastStart = 0;
			lastEnd = this.HORIZONTAL_PIXELS;
			if (this.win0 && y >= this.win0Top && y < this.win0Bottom) {
				if (this.windows[0].enabled[layer.index]) {
					this.setBlendEnabled(layer.index, this.windows[0].special && this.target1[layer.index], this.blendMode);
					layer.drawScanline(backing, layer, this.win0Left, this.win0Right);
				}
				firstStart = Math.max(firstStart, this.win0Left);
				firstEnd = Math.min(firstEnd, this.win0Left);
				lastStart = Math.max(lastStart, this.win0Right);
				lastEnd = Math.min(lastEnd, this.win0Right);
			}
			if (this.win1 && y >= this.win1Top && y < this.win1Bottom) {
				if (this.windows[1].enabled[layer.index]) {
					this.setBlendEnabled(layer.index, this.windows[1].special && this.target1[layer.index], this.blendMode);
					if (!this.windows[0].enabled[layer.index] && (this.win1Left < firstStart || this.win1Right < lastStart)) {
						// We've been cut in two by window 0!
						layer.drawScanline(backing, layer, this.win1Left, firstStart);
						layer.drawScanline(backing, layer, lastEnd, this.win1Right);
					} else {
						layer.drawScanline(backing, layer, this.win1Left, this.win1Right);
					}
				}
				firstStart = Math.max(firstStart, this.win1Left);
				firstEnd = Math.min(firstEnd, this.win1Left);
				lastStart = Math.max(lastStart, this.win1Right);
				lastEnd = Math.min(lastEnd, this.win1Right);
			}
			// Do last two
			if (this.windows[2].enabled[layer.index] || (this.objwin && this.windows[3].enabled[layer.index])) {
				// WINOUT/OBJWIN
				this.objwinActive = this.objwin;
				this.setBlendEnabled(layer.index, this.windows[2].special && this.target1[layer.index], this.blendMode); // Window 3 handled in pushPixel
				if (firstEnd > lastStart) {
					layer.drawScanline(backing, layer, 0, this.HORIZONTAL_PIXELS);
				} else {
					if (firstEnd) {
						layer.drawScanline(backing, layer, 0, firstEnd);
					}
					if (lastStart < this.HORIZONTAL_PIXELS) {
						layer.drawScanline(backing, layer, lastStart, this.HORIZONTAL_PIXELS);
					}
					if (lastEnd < firstStart) {
						layer.drawScanline(backing, layer, lastEnd, firstStart);
					}
				}
			}

			this.setBlendEnabled(this.LAYER_BACKDROP, this.target1[this.LAYER_BACKDROP] && this.windows[2].special, this.blendMode);
		}
		if (layer.bg) {
			layer.sx += layer.dmx;
			layer.sy += layer.dmy;
		}
	}

	this.finishScanline(backing);
};

GameBoyAdvanceSoftwareRenderer.prototype.finishScanline = function(backing) {
	var color;
	var bd = this.palette.accessColor(this.LAYER_BACKDROP, 0);
	var xx = this.vcount * this.HORIZONTAL_PIXELS * 4;
	var isTarget2 = this.target2[this.LAYER_BACKDROP];
	for (var x = 0; x < this.HORIZONTAL_PIXELS; ++x) {
		if (backing.stencil[x] & this.WRITTEN_MASK) {
			color = backing.color[x];
			if (isTarget2 && backing.stencil[x] & this.TARGET1_MASK) {
				color = this.palette.mix(this.blendA, color, this.blendB, bd);
			}
			this.palette.convert16To32(color, this.sharedColor);
		} else {
			this.palette.convert16To32(bd, this.sharedColor);
		}
		this.pixelData.data[xx++] = this.sharedColor[0];
		this.pixelData.data[xx++] = this.sharedColor[1];
		this.pixelData.data[xx++] = this.sharedColor[2];
		xx++;
	}
};

GameBoyAdvanceSoftwareRenderer.prototype.startDraw = function() {
	// Nothing to do
};

GameBoyAdvanceSoftwareRenderer.prototype.finishDraw = function(caller) {
	this.bg[2].sx = this.bg[2].refx;
	this.bg[2].sy = this.bg[2].refy;
	this.bg[3].sx = this.bg[3].refx;
	this.bg[3].sy = this.bg[3].refy;
	caller.finishDraw(this.pixelData);
};

function GameBoyAdvanceInterruptHandler() {
	this.inherit();
	this.FREQUENCY = 0x1000000;

	this.cpu = null;
	this.enable = false;

	this.IRQ_VBLANK = 0x0;
	this.IRQ_HBLANK = 0x1;
	this.IRQ_VCOUNTER = 0x2;
	this.IRQ_TIMER0 = 0x3;
	this.IRQ_TIMER1 = 0x4;
	this.IRQ_TIMER2 = 0x5;
	this.IRQ_TIMER3 = 0x6;
	this.IRQ_SIO = 0x7;
	this.IRQ_DMA0 = 0x8;
	this.IRQ_DMA1 = 0x9;
	this.IRQ_DMA2 = 0xA;
	this.IRQ_DMA3 = 0xB;
	this.IRQ_KEYPAD = 0xC;
	this.IRQ_GAMEPAK = 0xD;

	this.MASK_VBLANK = 0x0001;
	this.MASK_HBLANK = 0x0002;
	this.MASK_VCOUNTER = 0x0004;
	this.MASK_TIMER0 = 0x0008;
	this.MASK_TIMER1 = 0x0010;
	this.MASK_TIMER2 = 0x0020;
	this.MASK_TIMER3 = 0x0040;
	this.MASK_SIO = 0x0080;
	this.MASK_DMA0 = 0x0100;
	this.MASK_DMA1 = 0x0200;
	this.MASK_DMA2 = 0x0400;
	this.MASK_DMA3 = 0x0800;
	this.MASK_KEYPAD = 0x1000;
	this.MASK_GAMEPAK = 0x2000;
};

GameBoyAdvanceInterruptHandler.prototype.clear = function() {
	this.enable = false;
	this.enabledIRQs = 0;
	this.interruptFlags = 0;

	this.dma = new Array();
	for (var i = 0; i < 4; ++i) {
		this.dma.push({
			source: 0,
			dest: 0,
			count: 0,
			nextSource: 0,
			nextDest: 0,
			nextCount: 0,
			srcControl: 0,
			dstControl: 0,
			repeat: false,
			width: 0,
			drq: false,
			timing: 0,
			doIrq: false,
			enable: false,
			nextIRQ: 0
		});
	}

	this.timersEnabled = 0;
	this.timers = new Array();
	for (var i = 0; i < 4; ++i) {
		this.timers.push({
			reload: 0,
			oldReload: 0,
			prescaleBits: 0,
			countUp: false,
			doIrq: false,
			enable: false,
			lastEvent: 0,
			nextEvent: 0,
			overflowInterval: 1
		});
	}

	this.nextEvent = 0;
	this.springIRQ = false;
	this.resetSP();
};

GameBoyAdvanceInterruptHandler.prototype.freeze = function() {
	return {
		'enable': this.enable,
		'enabledIRQs': this.enabledIRQs,
		'interruptFlags': this.interruptFlags,
		'dma': this.dma,
		'timers': this.timers,
		'nextEvent': this.nextEvent,
		'springIRQ': this.springIRQ
	};
};

GameBoyAdvanceInterruptHandler.prototype.defrost = function(frost) {
	this.enable = frost.enable;
	this.enabledIRQs = frost.enabledIRQs;
	this.interruptFlags = frost.interruptFlags;
	this.dma = frost.dma;
	this.timers = frost.timers;
	this.timersEnabled = 0;
	if (this.timers[0].enable) {
		++this.timersEnabled;
	}
	if (this.timers[1].enable) {
		++this.timersEnabled;
	}
	if (this.timers[2].enable) {
		++this.timersEnabled;
	}
	if (this.timers[3].enable) {
		++this.timersEnabled;
	}
	this.nextEvent = frost.nextEvent;
	this.springIRQ = frost.springIRQ;
};

GameBoyAdvanceInterruptHandler.prototype.updateTimers = function() {
	if (this.nextEvent > this.cpu.cycles) {
		return;
	}

	if (this.springIRQ) {
		this.cpu.raiseIRQ();
		this.springIRQ = false;
	}

	this.video.updateTimers(this.cpu);
	this.audio.updateTimers();
	if (this.timersEnabled) {
		var timer = this.timers[0];
		if (timer.enable) {
			if (this.cpu.cycles >= timer.nextEvent) {
				timer.lastEvent = timer.nextEvent;
				timer.nextEvent += timer.overflowInterval;
				this.io.registers[this.io.TM0CNT_LO >> 1] = timer.reload;
				timer.oldReload = timer.reload;

				if (timer.doIrq) {
					this.raiseIRQ(this.IRQ_TIMER0);
				}

				if (this.audio.enabled) {
					if (this.audio.enableChannelA && !this.audio.soundTimerA && this.audio.dmaA >= 0) {
						this.audio.sampleFifoA();
					}
	
					if (this.audio.enableChannelB && !this.audio.soundTimerB && this.audio.dmaB >= 0) {
						this.audio.sampleFifoB();
					}
				}

				timer = this.timers[1];
				if (timer.countUp) {
					if (++this.io.registers[this.io.TM1CNT_LO >> 1] == 0x10000) {
						timer.nextEvent = this.cpu.cycles;
					}
				}
			}
		}

		timer = this.timers[1];
		if (timer.enable) {
			if (this.cpu.cycles >= timer.nextEvent) {
				timer.lastEvent = timer.nextEvent;
				timer.nextEvent += timer.overflowInterval;
				if (!timer.countUp || this.io.registers[this.io.TM1CNT_LO >> 1] == 0x10000) {
					this.io.registers[this.io.TM1CNT_LO >> 1] = timer.reload;
				}
				timer.oldReload = timer.reload;

				if (timer.doIrq) {
					this.raiseIRQ(this.IRQ_TIMER1);
				}

				if (timer.countUp) {
					timer.nextEvent = 0;
				}

				if (this.audio.enabled) {
					if (this.audio.enableChannelA && this.audio.soundTimerA && this.audio.dmaA >= 0) {
						this.audio.sampleFifoA();
					}
	
					if (this.audio.enableChannelB && this.audio.soundTimerB && this.audio.dmaB >= 0) {
						this.audio.sampleFifoB();
					}
				}

				timer = this.timers[2];
				if (timer.countUp) {
					if (++this.io.registers[this.io.TM2CNT_LO >> 1] == 0x10000) {
						timer.nextEvent = this.cpu.cycles;
					}
				}
			}
		}

		timer = this.timers[2];
		if (timer.enable) {
			if (this.cpu.cycles >= timer.nextEvent) {
				timer.lastEvent = timer.nextEvent;
				timer.nextEvent += timer.overflowInterval;
				if (!timer.countUp || this.io.registers[this.io.TM2CNT_LO >> 1] == 0x10000) {
					this.io.registers[this.io.TM2CNT_LO >> 1] = timer.reload;
				}
				timer.oldReload = timer.reload;

				if (timer.doIrq) {
					this.raiseIRQ(this.IRQ_TIMER2);
				}

				if (timer.countUp) {
					timer.nextEvent = 0;
				}

				timer = this.timers[3];
				if (timer.countUp) {
					if (++this.io.registers[this.io.TM3CNT_LO >> 1] == 0x10000) {
						timer.nextEvent = this.cpu.cycles;
					}
				}
			}
		}

		timer = this.timers[3];
		if (timer.enable) {
			if (this.cpu.cycles >= timer.nextEvent) {
				timer.lastEvent = timer.nextEvent;
				timer.nextEvent += timer.overflowInterval;
				if (!timer.countUp || this.io.registers[this.io.TM3CNT_LO >> 1] == 0x10000) {
					this.io.registers[this.io.TM3CNT_LO >> 1] = timer.reload;
				}
				timer.oldReload = timer.reload;

				if (timer.doIrq) {
					this.raiseIRQ(this.IRQ_TIMER3);
				}

				if (timer.countUp) {
					timer.nextEvent = 0;
				}
			}
		}
	}

	var dma = this.dma[0];
	if (dma.enable && dma.doIrq && dma.nextIRQ && this.cpu.cycles >= dma.nextIRQ) {
		dma.nextIRQ = 0;
		this.raiseIRQ(this.IRQ_DMA0);
	}

	dma = this.dma[1];
	if (dma.enable && dma.doIrq && dma.nextIRQ && this.cpu.cycles >= dma.nextIRQ) {
		dma.nextIRQ = 0;
		this.raiseIRQ(this.IRQ_DMA1);
	}

	dma = this.dma[2];
	if (dma.enable && dma.doIrq && dma.nextIRQ && this.cpu.cycles >= dma.nextIRQ) {
		dma.nextIRQ = 0;
		this.raiseIRQ(this.IRQ_DMA2);
	}

	dma = this.dma[3];
	if (dma.enable && dma.doIrq && dma.nextIRQ && this.cpu.cycles >= dma.nextIRQ) {
		dma.nextIRQ = 0;
		this.raiseIRQ(this.IRQ_DMA3);
	}

	this.pollNextEvent();
}

GameBoyAdvanceInterruptHandler.prototype.resetSP = function() {
	this.cpu.switchMode(this.cpu.MODE_SUPERVISOR);
	this.cpu.gprs[this.cpu.SP] = 0x3007FE0;
	this.cpu.switchMode(this.cpu.MODE_IRQ);
	this.cpu.gprs[this.cpu.SP] = 0x3007FA0;
	this.cpu.switchMode(this.cpu.MODE_SYSTEM);
	this.cpu.gprs[this.cpu.SP] = 0x3007F00;
};

GameBoyAdvanceInterruptHandler.prototype.swi32 = function(opcode) {
	this.swi(opcode >> 16);
};

GameBoyAdvanceInterruptHandler.prototype.swi = function(opcode) {
	if (this.core.mmu.bios.real) {
		this.cpu.raiseTrap();
		return;
	}

	switch (opcode) {
	case 0x00:
		// SoftReset
		var mem = this.core.mmu.memory[this.core.mmu.REGION_WORKING_IRAM];
		var flag = mem.loadU8(0x7FFA);
		for (var i = 0x7E00; i < 0x8000; i += 4) {
			mem.store32(i, 0);
		}
		this.resetSP();
		if (!flag) {
			this.cpu.gprs[this.cpu.LR] = 0x08000000;
		} else {
			this.cpu.gprs[this.cpu.LR] = 0x02000000;
		}
		this.cpu.switchExecMode(this.cpu.MODE_ARM);
		this.cpu.instruction.writesPC = true;
		this.cpu.gprs[this.cpu.PC] = this.cpu.gprs[this.cpu.LR];
		break;
	case 0x01:
		// RegisterRamReset
		var regions = this.cpu.gprs[0];
		if (regions & 0x01) {
			this.core.mmu.memory[this.core.mmu.REGION_WORKING_RAM] = new MemoryBlock(this.core.mmu.SIZE_WORKING_RAM, 9);
		}
		if (regions & 0x02) {
			for (var i = 0; i < this.core.mmu.SIZE_WORKING_IRAM - 0x200; i += 4) {
				this.core.mmu.memory[this.core.mmu.REGION_WORKING_IRAM].store32(i, 0);
			}
		}
		if (regions & 0x1C) {
			this.video.renderPath.clearSubsets(this.core.mmu, regions);
		}
		if (regions & 0xE0) {
			this.core.STUB('Unimplemented RegisterRamReset');
		}
		break;
	case 0x02:
		// Halt
		this.halt();
		break;
	case 0x05:
		// VBlankIntrWait
		this.cpu.gprs[0] = 1;
		this.cpu.gprs[1] = 1;
		// Fall through:
	case 0x04:
		// IntrWait
		if (!this.enable) {
			this.io.store16(this.io.IME, 1);
		}
		if (!this.cpu.gprs[0] && this.interruptFlags & this.cpu.gprs[1]) {
			return;
		}
		this.dismissIRQs(0xFFFFFFFF);
		this.cpu.raiseTrap();
		break;
	case 0x06:
		// Div
		var result = (this.cpu.gprs[0] | 0) / (this.cpu.gprs[1] | 0);
		var mod = (this.cpu.gprs[0] | 0) % (this.cpu.gprs[1] | 0);
		this.cpu.gprs[0] = result | 0;
		this.cpu.gprs[1] = mod | 0;
		this.cpu.gprs[3] = Math.abs(result | 0);
		break;
	case 0x07:
		// DivArm
		var result = (this.cpu.gprs[1] | 0) / (this.cpu.gprs[0] | 0);
		var mod = (this.cpu.gprs[1] | 0) % (this.cpu.gprs[0] | 0);
		this.cpu.gprs[0] = result | 0;
		this.cpu.gprs[1] = mod | 0;
		this.cpu.gprs[3] = Math.abs(result | 0);
		break;
	case 0x08:
		// Sqrt
		var root = Math.sqrt(this.cpu.gprs[0]);
		this.cpu.gprs[0] = root | 0; // Coerce down to int
		break;
	case 0x0A:
		// ArcTan2
		var x = this.cpu.gprs[0] / 16384;
		var y = this.cpu.gprs[1] / 16384;
		this.cpu.gprs[0] = (Math.atan2(y, x) / (2 * Math.PI)) * 0x10000;
		break;
	case 0x0B:
		// CpuSet
		var source = this.cpu.gprs[0];
		var dest = this.cpu.gprs[1];
		var mode = this.cpu.gprs[2];
		var count = mode & 0x000FFFFF;
		var fill = mode & 0x01000000;
		var wordsize = (mode & 0x04000000) ? 4 : 2;
		if (fill) {
			if (wordsize == 4) {
				source &= 0xFFFFFFFC;
				dest &= 0xFFFFFFFC;
				var word = this.cpu.mmu.load32(source);
				for (var i = 0; i < count; ++i) {
					this.cpu.mmu.store32(dest + (i << 2), word);
				}
			} else {
				source &= 0xFFFFFFFE;
				dest &= 0xFFFFFFFE;
				var word = this.cpu.mmu.load16(source);
				for (var i = 0; i < count; ++i) {
					this.cpu.mmu.store16(dest + (i << 1), word);
				}
			}
		} else {
			if (wordsize == 4) {
				source &= 0xFFFFFFFC;
				dest &= 0xFFFFFFFC;
				for (var i = 0; i < count; ++i) {
					var word = this.cpu.mmu.load32(source + (i << 2));
					this.cpu.mmu.store32(dest + (i << 2), word);
				}
			} else {
				source &= 0xFFFFFFFE;
				dest &= 0xFFFFFFFE;
				for (var i = 0; i < count; ++i) {
					var word = this.cpu.mmu.load16(source + (i << 1));
					this.cpu.mmu.store16(dest + (i << 1), word);
				}
			}
		}
		return;
	case 0x0C:
		// FastCpuSet
		var source = this.cpu.gprs[0] & 0xFFFFFFFC;
		var dest = this.cpu.gprs[1] & 0xFFFFFFFC;
		var mode = this.cpu.gprs[2];
		var count = mode & 0x000FFFFF;
		count = ((count + 7) >> 3) << 3;
		var fill = mode & 0x01000000;
		if (fill) {
			var word = this.cpu.mmu.load32(source);
			for (var i = 0; i < count; ++i) {
				this.cpu.mmu.store32(dest + (i << 2), word);
			}
		} else {
			for (var i = 0; i < count; ++i) {
				var word = this.cpu.mmu.load32(source + (i << 2));
				this.cpu.mmu.store32(dest + (i << 2), word);
			}
		}
		return;
	case 0x0E:
		// BgAffineSet
		var i = this.cpu.gprs[2];
		var ox, oy;
		var cx, cy;
		var sx, sy;
		var theta;
		var offset = this.cpu.gprs[0];
		var destination = this.cpu.gprs[1];
		var a, b, c, d;
		var rx, ry;
		while (i--) {
			// [ sx   0  0 ]   [ cos(theta)  -sin(theta)  0 ]   [ 1  0  cx - ox ]   [ A B rx ]
			// [  0  sy  0 ] * [ sin(theta)   cos(theta)  0 ] * [ 0  1  cy - oy ] = [ C D ry ]
			// [  0   0  1 ]   [     0            0       1 ]   [ 0  0     1    ]   [ 0 0  1 ]
			ox = this.core.mmu.load32(offset) / 256;
			oy = this.core.mmu.load32(offset + 4) / 256;
			cx = this.core.mmu.load16(offset + 8);
			cy = this.core.mmu.load16(offset + 10);
			sx = this.core.mmu.load16(offset + 12) / 256;
			sy = this.core.mmu.load16(offset + 14) / 256;
			theta = (this.core.mmu.loadU16(offset + 16) >> 8) / 128 * Math.PI;
			offset += 20;
			// Rotation
			a = d = Math.cos(theta);
			b = c = Math.sin(theta);
			// Scale
			a *= sx;
			b *= -sx;
			c *= sy;
			d *= sy;
			// Translate
			rx = ox - (a * cx + b * cy);
			ry = oy - (c * cx + d * cy);
			this.core.mmu.store16(destination, (a * 256) | 0);
			this.core.mmu.store16(destination + 2, (b * 256) | 0);
			this.core.mmu.store16(destination + 4, (c * 256) | 0);
			this.core.mmu.store16(destination + 6, (d * 256) | 0);
			this.core.mmu.store32(destination + 8, (rx * 256) | 0);
			this.core.mmu.store32(destination + 12, (ry * 256) | 0);
			destination += 16;
		}
		break;
	case 0x0F:
		// ObjAffineSet
		var i = this.cpu.gprs[2];
		var sx, sy;
		var theta;
		var offset = this.cpu.gprs[0];
		var destination = this.cpu.gprs[1]
		var diff = this.cpu.gprs[3];
		var a, b, c, d;
		while (i--) {
			// [ sx   0 ]   [ cos(theta)  -sin(theta) ]   [ A B ]
			// [  0  sy ] * [ sin(theta)   cos(theta) ] = [ C D ]
			sx = this.core.mmu.load16(offset) / 256;
			sy = this.core.mmu.load16(offset + 2) / 256;
			theta = (this.core.mmu.loadU16(offset + 4) >> 8) / 128 * Math.PI;
			offset += 6;
			// Rotation
			a = d = Math.cos(theta);
			b = c = Math.sin(theta);
			// Scale
			a *= sx;
			b *= -sx;
			c *= sy;
			d *= sy;
			this.core.mmu.store16(destination, (a * 256) | 0);
			this.core.mmu.store16(destination + diff, (b * 256) | 0);
			this.core.mmu.store16(destination + diff * 2, (c * 256) | 0);
			this.core.mmu.store16(destination + diff * 3, (d * 256) | 0);
			destination += diff * 4;
		}
		break;
	case 0x11:
		// LZ77UnCompWram
		this.lz77(this.cpu.gprs[0], this.cpu.gprs[1], 1);
		break;
	case 0x12:
		// LZ77UnCompVram
		this.lz77(this.cpu.gprs[0], this.cpu.gprs[1], 2);
		break;
	case 0x13:
		// HuffUnComp
		this.huffman(this.cpu.gprs[0], this.cpu.gprs[1]);
		break;
	case 0x14:
		// RlUnCompWram
		this.rl(this.cpu.gprs[0], this.cpu.gprs[1], 1);
		break;
	case 0x15:
		// RlUnCompVram
		this.rl(this.cpu.gprs[0], this.cpu.gprs[1], 2);
		break;
	case 0x1F:
		// MidiKey2Freq
		var key = this.cpu.mmu.load32(this.cpu.gprs[0] + 4);
		this.cpu.gprs[0] = key / Math.pow(2, (180 - this.cpu.gprs[1] - this.cpu.gprs[2] / 256) / 12) >>> 0;
		break;
	default:
		throw "Unimplemented software interrupt: 0x" + opcode.toString(16);
	}
};

GameBoyAdvanceInterruptHandler.prototype.masterEnable = function(value) {
	this.enable = value;

	if (this.enable && this.enabledIRQs & this.interruptFlags) {
		this.cpu.raiseIRQ();
	}
};

GameBoyAdvanceInterruptHandler.prototype.setInterruptsEnabled = function(value) {
	this.enabledIRQs = value;

	if (this.enabledIRQs & this.MASK_SIO) {
		this.core.STUB('Serial I/O interrupts not implemented');
	}

	if (this.enabledIRQs & this.MASK_KEYPAD) {
		this.core.STUB('Keypad interrupts not implemented');
	}

	if (this.enable && this.enabledIRQs & this.interruptFlags) {
		this.cpu.raiseIRQ();
	}
};

GameBoyAdvanceInterruptHandler.prototype.pollNextEvent = function() {
	var nextEvent = this.video.nextEvent;
	var test;

	if (this.audio.enabled) {
		test = this.audio.nextEvent;
		if (!nextEvent || test < nextEvent) {
			nextEvent = test;
		}
	}

	if (this.timersEnabled) {
		var timer = this.timers[0];
		test = timer.nextEvent;
		if (timer.enable && test && (!nextEvent || test < nextEvent)) {
			nextEvent = test;
		}

		timer = this.timers[1];
		test = timer.nextEvent;
		if (timer.enable && test && (!nextEvent || test < nextEvent)) {
			nextEvent = test;
		}
		timer = this.timers[2];
		test = timer.nextEvent;
		if (timer.enable && test && (!nextEvent || test < nextEvent)) {
			nextEvent = test;
		}
		timer = this.timers[3];
		test = timer.nextEvent;
		if (timer.enable && test && (!nextEvent || test < nextEvent)) {
			nextEvent = test;
		}
	}

	var dma = this.dma[0];
	test = dma.nextIRQ;
	if (dma.enable && dma.doIrq && test && (!nextEvent || test < nextEvent)) {
		nextEvent = test;
	}

	dma = this.dma[1];
	test = dma.nextIRQ;
	if (dma.enable && dma.doIrq && test && (!nextEvent || test < nextEvent)) {
		nextEvent = test;
	}

	dma = this.dma[2];
	test = dma.nextIRQ;
	if (dma.enable && dma.doIrq && test && (!nextEvent || test < nextEvent)) {
		nextEvent = test;
	}

	dma = this.dma[3];
	test = dma.nextIRQ;
	if (dma.enable && dma.doIrq && test && (!nextEvent || test < nextEvent)) {
		nextEvent = test;
	}

	this.core.ASSERT(nextEvent >= this.cpu.cycles, "Next event is before present");
	this.nextEvent = nextEvent;
};

GameBoyAdvanceInterruptHandler.prototype.waitForIRQ = function() {
	var timer;
	var irqPending = this.testIRQ() || this.video.hblankIRQ || this.video.vblankIRQ || this.video.vcounterIRQ;
	if (this.timersEnabled) {
		timer = this.timers[0];
		irqPending = irqPending || timer.doIrq;
		timer = this.timers[1];
		irqPending = irqPending || timer.doIrq;
		timer = this.timers[2];
		irqPending = irqPending || timer.doIrq;
		timer = this.timers[3];
		irqPending = irqPending || timer.doIrq;
	}
	if (!irqPending) {
		return false;
	}

	for (;;) {
		this.pollNextEvent();

		if (!this.nextEvent) {
			return false;
		} else {
			this.cpu.cycles = this.nextEvent;
			this.updateTimers();
			if (this.interruptFlags) {
				return true;
			}
		}
	}
};

GameBoyAdvanceInterruptHandler.prototype.testIRQ = function() {
	if (this.enable && this.enabledIRQs & this.interruptFlags) {
		this.springIRQ = true;
		this.nextEvent = this.cpu.cycles;
		return true;
	}
	return false;
};

GameBoyAdvanceInterruptHandler.prototype.raiseIRQ = function(irqType) {
	this.interruptFlags |= 1 << irqType;
	this.io.registers[this.io.IF >> 1] = this.interruptFlags;

	if (this.enable && (this.enabledIRQs & 1 << irqType)) {
		this.cpu.raiseIRQ();
	}
};

GameBoyAdvanceInterruptHandler.prototype.dismissIRQs = function(irqMask) {
	this.interruptFlags &= ~irqMask;
	this.io.registers[this.io.IF >> 1] = this.interruptFlags;
};

GameBoyAdvanceInterruptHandler.prototype.dmaSetSourceAddress = function(dma, address) {
	this.dma[dma].source = address & 0xFFFFFFFE;
};

GameBoyAdvanceInterruptHandler.prototype.dmaSetDestAddress = function(dma, address) {
	this.dma[dma].dest = address & 0xFFFFFFFE;
};

GameBoyAdvanceInterruptHandler.prototype.dmaSetWordCount = function(dma, count) {
	this.dma[dma].count = count ? count : (dma == 3 ? 0x10000 : 0x4000);
};

GameBoyAdvanceInterruptHandler.prototype.dmaWriteControl = function(dma, control) {
	var currentDma = this.dma[dma];
	var wasEnabled = currentDma.enable;
	currentDma.dstControl = (control & 0x0060) >> 5;
	currentDma.srcControl = (control & 0x0180) >> 7;
	currentDma.repeat = !!(control & 0x0200);
	currentDma.width = (control & 0x0400) ? 4 : 2;
	currentDma.drq = !!(control & 0x0800);
	currentDma.timing = (control & 0x3000) >> 12;
	currentDma.doIrq = !!(control & 0x4000);
	currentDma.enable = !!(control & 0x8000);
	currentDma.nextIRQ = 0;

	if (currentDma.drq) {
		this.core.WARN('DRQ not implemented');
	}

	if (!wasEnabled && currentDma.enable) {
		currentDma.nextSource = currentDma.source;
		currentDma.nextDest = currentDma.dest;
		currentDma.nextCount = currentDma.count;
		this.cpu.mmu.scheduleDma(dma, currentDma);
	}
};

GameBoyAdvanceInterruptHandler.prototype.timerSetReload = function(timer, reload) {
	this.timers[timer].reload = reload & 0xFFFF;
};

GameBoyAdvanceInterruptHandler.prototype.timerWriteControl = function(timer, control) {
	var currentTimer = this.timers[timer];
	var oldPrescale = currentTimer.prescaleBits;
	switch (control & 0x0003) {
	case 0x0000:
		currentTimer.prescaleBits = 0;
		break;
	case 0x0001:
		currentTimer.prescaleBits = 6;
		break;
	case 0x0002:
		currentTimer.prescaleBits = 8;
		break;
	case 0x0003:
		currentTimer.prescaleBits = 10;
		break;
	}
	currentTimer.countUp = !!(control & 0x0004);
	currentTimer.doIrq = !!(control & 0x0040);
	currentTimer.overflowInterval = (0x10000 - currentTimer.reload) << currentTimer.prescaleBits;
	var wasEnabled = currentTimer.enable;
	currentTimer.enable = !!(((control & 0x0080) >> 7) << timer);
	if (!wasEnabled && currentTimer.enable) {
		if (!currentTimer.countUp) {
			currentTimer.lastEvent = this.cpu.cycles;
			currentTimer.nextEvent = this.cpu.cycles + currentTimer.overflowInterval;
		} else {
			currentTimer.nextEvent = 0;
		}
		this.io.registers[(this.io.TM0CNT_LO + (timer << 2)) >> 1] = currentTimer.reload;
		currentTimer.oldReload = currentTimer.reload;
		++this.timersEnabled;
	} else if (wasEnabled && !currentTimer.enable) {
		if (!currentTimer.countUp) {
			this.io.registers[(this.io.TM0CNT_LO + (timer << 2)) >> 1] = currentTimer.oldReload + (this.cpu.cycles - currentTimer.lastEvent) >> oldPrescale;
		}
		--this.timersEnabled;
	} else if (currentTimer.prescaleBits != oldPrescale && !currentTimer.countUp) {
		// FIXME: this might be before present
		currentTimer.nextEvent = currentTimer.lastEvent + currentTimer.overflowInterval;
	}

	// We've changed the timers somehow...we need to reset the next event
	this.pollNextEvent();
};

GameBoyAdvanceInterruptHandler.prototype.timerRead = function(timer) {
	var currentTimer = this.timers[timer];
	if (currentTimer.enable && !currentTimer.countUp) {
		return currentTimer.oldReload + (this.cpu.cycles - currentTimer.lastEvent) >> currentTimer.prescaleBits;
	} else {
		return this.io.registers[(this.io.TM0CNT_LO + (timer << 2)) >> 1];
	}
};

GameBoyAdvanceInterruptHandler.prototype.halt = function() {
	if (!this.enable) {
		throw "Requested HALT when interrupts were disabled!";
	}
	if (!this.waitForIRQ()) {
		throw "Waiting on interrupt forever.";
	}
}

GameBoyAdvanceInterruptHandler.prototype.lz77 = function(source, dest, unitsize) {
	// TODO: move to a different file
	var remaining = (this.cpu.mmu.load32(source) & 0xFFFFFF00) >> 8;
	// We assume the signature byte (0x10) is correct
	var blockheader;
	var sPointer = source + 4;
	var dPointer = dest;
	var blocksRemaining = 0;
	var block;
	var disp;
	var bytes;
	var buffer = 0;
	var loaded;
	while (remaining > 0) {
		if (blocksRemaining) {
			if (blockheader & 0x80) {
				// Compressed
				block = this.cpu.mmu.loadU8(sPointer) | (this.cpu.mmu.loadU8(sPointer + 1) << 8);
				sPointer += 2;
				disp = dPointer - (((block & 0x000F) << 8) | ((block & 0xFF00) >> 8)) - 1;
				bytes = ((block & 0x00F0) >> 4) + 3;
				while (bytes-- && remaining) {
					loaded = this.cpu.mmu.loadU8(disp++);
					if (unitsize == 2) {
						buffer >>= 8;
						buffer |= loaded << 8;
						if (dPointer & 1) {
							this.cpu.mmu.store16(dPointer - 1, buffer);
						}
					} else {
						this.cpu.mmu.store8(dPointer, loaded);
					}
					--remaining;
					++dPointer;
				}
			} else {
				// Uncompressed
				loaded = this.cpu.mmu.loadU8(sPointer++);
				if (unitsize == 2) {
					buffer >>= 8;
					buffer |= loaded << 8;
					if (dPointer & 1) {
						this.cpu.mmu.store16(dPointer - 1, buffer);
					}
				} else {
					this.cpu.mmu.store8(dPointer, loaded);
				}
				--remaining;
				++dPointer;
			}
			blockheader <<= 1;
			--blocksRemaining;
		} else {
			blockheader = this.cpu.mmu.loadU8(sPointer++);
			blocksRemaining = 8;
		}
	}
};

GameBoyAdvanceInterruptHandler.prototype.huffman = function(source, dest) {
	source = source & 0xFFFFFFFC;
	var header = this.cpu.mmu.load32(source);
	var remaining = header >> 8;
	var bits = header & 0xF;
	if (32 % bits) {
		throw 'Unimplemented unaligned Huffman';
	}
	var padding = (4 - remaining) & 0x3;
	remaining &= 0xFFFFFFFC;
	// We assume the signature byte (0x20) is correct
	var tree = [];
	var treesize = (this.cpu.mmu.loadU8(source + 4) << 1) + 1;
	var block;
	var sPointer = source + 5 + treesize;
	var dPointer = dest & 0xFFFFFFFC;
	var i;
	for (i = 0; i < treesize; ++i) {
		tree.push(this.cpu.mmu.loadU8(source + 5 + i));
	}
	var node;
	var offset = 0;
	var bitsRemaining;
	var readBits;
	var bitsSeen = 0;
	node = tree[0];
	while (remaining > 0) {
		var bitstream = this.cpu.mmu.load32(sPointer);
		sPointer += 4;
		for (bitsRemaining = 32; bitsRemaining > 0; --bitsRemaining, bitstream <<= 1) {
			if (typeof (node) === 'number') {
				// Lazily construct tree
				var next = (offset - 1 | 1) + ((node & 0x3F) << 1) + 2;
				node = {
					l: next,
					r: next + 1,
					lTerm: node & 0x80,
					rTerm: node & 0x40
				};
				tree[offset] = node;
			}

			if (bitstream & 0x80000000) {
				// Go right
				if (node.rTerm) {
					readBits = tree[node.r];
				} else {
					offset = node.r;
					node = tree[node.r];
					continue;
				}
			} else {
				// Go left
				if (node.lTerm) {
					readBits = tree[node.l];
				} else {
					offset = node.l;
					node = tree[offset];
					continue;
				}
			}

			block |= (readBits & ((1 << bits) - 1)) << bitsSeen;
			bitsSeen += bits;
			offset = 0;
			node = tree[0];
			if (bitsSeen == 32) {
				bitsSeen = 0;
				this.cpu.mmu.store32(dPointer, block);
				dPointer += 4;
				remaining -= 4;
				block = 0;
			}
		}

	}
	if (padding) {
		this.cpu.mmu.store32(dPointer, block);
	}
};

GameBoyAdvanceInterruptHandler.prototype.rl = function(source, dest, unitsize) {
	source = source & 0xFFFFFFFC;
	var remaining = (this.cpu.mmu.load32(source) & 0xFFFFFF00) >> 8;
	var padding = (4 - remaining) & 0x3;
	// We assume the signature byte (0x30) is correct
	var blockheader;
	var block;
	var sPointer = source + 4;
	var dPointer = dest;
	var buffer = 0;
	while (remaining > 0) {
		blockheader = this.cpu.mmu.loadU8(sPointer++);
		if (blockheader & 0x80) {
			// Compressed
			blockheader &= 0x7F;
			blockheader += 3;
			block = this.cpu.mmu.loadU8(sPointer++);
			while (blockheader-- && remaining) {
				--remaining;
				if (unitsize == 2) {
					buffer >>= 8;
					buffer |= block << 8;
					if (dPointer & 1) {
						this.cpu.mmu.store16(dPointer - 1, buffer);
					}
				} else {
					this.cpu.mmu.store8(dPointer, block);
				}
				++dPointer;
			}
		} else {
			// Uncompressed
			blockheader++;
			while (blockheader-- && remaining) {
				--remaining;
				block = this.cpu.mmu.loadU8(sPointer++);
				if (unitsize == 2) {
					buffer >>= 8;
					buffer |= block << 8;
					if (dPointer & 1) {
						this.cpu.mmu.store16(dPointer - 1, buffer);
					}
				} else {
					this.cpu.mmu.store8(dPointer, block);
				}
				++dPointer;
			}
		}
	}
	while (padding--) {
		this.cpu.mmu.store8(dPointer++, 0);
	}
};

function GameBoyAdvanceKeypad() {
	this.KEYCODE_LEFT = 37;
	this.KEYCODE_UP = 38;
	this.KEYCODE_RIGHT = 39;
	this.KEYCODE_DOWN = 40;
	this.KEYCODE_START = 13;
	this.KEYCODE_SELECT = 220;
	this.KEYCODE_A = 90;
	this.KEYCODE_B = 88;
	this.KEYCODE_L = 65;
	this.KEYCODE_R = 83;

	this.GAMEPAD_LEFT = 14;
	this.GAMEPAD_UP = 12;
	this.GAMEPAD_RIGHT = 15;
	this.GAMEPAD_DOWN = 13;
	this.GAMEPAD_START = 9;
	this.GAMEPAD_SELECT = 8;
	this.GAMEPAD_A = 1;
	this.GAMEPAD_B = 0;
	this.GAMEPAD_L = 4;
	this.GAMEPAD_R = 5;
	this.GAMEPAD_THRESHOLD = 0.2;

	this.A = 0;
	this.B = 1;
	this.SELECT = 2;
	this.START = 3;
	this.RIGHT = 4;
	this.LEFT = 5;
	this.UP = 6;
	this.DOWN = 7;
	this.R = 8;
	this.L = 9;

	this.currentDown = 0x03FF;
	this.eatInput = false;

	this.gamepads = [];
};

GameBoyAdvanceKeypad.prototype.keyboardHandler = function(e) {
	var toggle = 0;
	switch (e.keyCode) {
	case this.KEYCODE_START:
		toggle = this.START;
		break;
	case this.KEYCODE_SELECT:
		toggle = this.SELECT;
		break;
	case this.KEYCODE_A:
		toggle = this.A;
		break;
	case this.KEYCODE_B:
		toggle = this.B;
		break;
	case this.KEYCODE_L:
		toggle = this.L;
		break;
	case this.KEYCODE_R:
		toggle = this.R;
		break;
	case this.KEYCODE_UP:
		toggle = this.UP;
		break;
	case this.KEYCODE_RIGHT:
		toggle = this.RIGHT;
		break;
	case this.KEYCODE_DOWN:
		toggle = this.DOWN;
		break;
	case this.KEYCODE_LEFT:
		toggle = this.LEFT;
		break;
	default:
		return;
	}

	toggle = 1 << toggle;
	if (e.type == "keydown") {
		this.currentDown &= ~toggle;
	} else {
		this.currentDown |= toggle;
	}

	if (this.eatInput) {
		e.preventDefault();
	}
};

GameBoyAdvanceKeypad.prototype.gamepadHandler = function(gamepad) {
	var value = 0;
	if (gamepad.buttons[this.GAMEPAD_LEFT] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.LEFT;
	}
	if (gamepad.buttons[this.GAMEPAD_UP] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.UP;
	}
	if (gamepad.buttons[this.GAMEPAD_RIGHT] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.RIGHT;
	}
	if (gamepad.buttons[this.GAMEPAD_DOWN] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.DOWN;
	}
	if (gamepad.buttons[this.GAMEPAD_START] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.START;
	}
	if (gamepad.buttons[this.GAMEPAD_SELECT] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.SELECT;
	}
	if (gamepad.buttons[this.GAMEPAD_A] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.A;
	}
	if (gamepad.buttons[this.GAMEPAD_B] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.B;
	}
	if (gamepad.buttons[this.GAMEPAD_L] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.L;
	}
	if (gamepad.buttons[this.GAMEPAD_R] > this.GAMEPAD_THRESHOLD) {
		value |= 1 << this.R;
	}

	this.currentDown = ~value & 0x3FF;
};

GameBoyAdvanceKeypad.prototype.gamepadConnectHandler = function(gamepad) {
	this.gamepads.push(gamepad);
};

GameBoyAdvanceKeypad.prototype.gamepadDisconnectHandler = function(gamepad) {
	this.gamepads = self.gamepads.filter(function(other) { return other != gamepad });
};

GameBoyAdvanceKeypad.prototype.pollGamepads = function() {
	var navigatorList = [];
	if (navigator.webkitGetGamepads) {
		navigatorList = navigator.webkitGetGamepads();
	} else if (navigator.getGamepads) {
		navigatorList = navigator.getGamepads();
	}

	// Let's all give a shout out to Chrome for making us get the gamepads EVERY FRAME
	if (navigatorList.length) {
		this.gamepads = [];
	}
	for (var i = 0; i < navigatorList.length; ++i) {
		if (navigatorList[i]) {
			this.gamepads.push(navigatorList[i]);
		}
	}
	if (this.gamepads.length > 0) {
		this.gamepadHandler(this.gamepads[0]);
	}

};

GameBoyAdvanceKeypad.prototype.registerHandlers = function() {
	window.addEventListener("keydown", this.keyboardHandler.bind(this), true);
	window.addEventListener("keyup", this.keyboardHandler.bind(this), true);

	window.addEventListener("gamepadconnected", this.gamepadConnectHandler.bind(this), true);
	window.addEventListener("mozgamepadconnected", this.gamepadConnectHandler.bind(this), true);
	window.addEventListener("webkitgamepadconnected", this.gamepadConnectHandler.bind(this), true);

	window.addEventListener("gamepaddisconnected", this.gamepadDisconnectHandler.bind(this), true);
	window.addEventListener("mozgamepaddisconnected", this.gamepadDisconnectHandler.bind(this), true);
	window.addEventListener("webkitgamepaddisconnected", this.gamepadDisconnectHandler.bind(this), true);
};

function GameBoyAdvanceSIO() {
	this.SIO_NORMAL_8 = 0;
	this.SIO_NORMAL_32 = 1;
	this.SIO_MULTI = 2;
	this.SIO_UART = 3;
	this.SIO_GPIO = 8;
	this.SIO_JOYBUS = 12;

	this.BAUD = [ 9600, 38400, 57600, 115200 ];
}

GameBoyAdvanceSIO.prototype.clear = function() {
	this.mode = this.SIO_GPIO;
	this.sd = false;

	this.irq = false;
	this.multiplayer = {
		baud: 0,
		si: 0,
		id: 0,
		error: 0,
		busy: 0,

		states: [ 0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF ]
	};

	this.linkLayer = null;
};

GameBoyAdvanceSIO.prototype.setMode = function(mode) {
	if (mode & 0x8) {
		mode &= 0xC;
	} else {
		mode &= 0x3;
	}
	this.mode = mode;

	this.core.INFO('Setting SIO mode to ' + hex(mode, 1));
};

GameBoyAdvanceSIO.prototype.writeRCNT = function(value) {
	if (this.mode != this.SIO_GPIO) {
		return;
	}

	this.core.STUB('General purpose serial not supported');
};

GameBoyAdvanceSIO.prototype.writeSIOCNT = function(value) {
	switch (this.mode) {
	case this.SIO_NORMAL_8:
		this.core.STUB('8-bit transfer unsupported');
		break;
	case this.SIO_NORMAL_32:
		this.core.STUB('32-bit transfer unsupported');
		break;
	case this.SIO_MULTI:
		this.multiplayer.baud = value & 0x0003;
		if (this.linkLayer) {
			this.linkLayer.setBaud(this.BAUD[this.multiplayer.baud]);
		}

		if (!this.multiplayer.si) {
			this.multiplayer.busy = value & 0x0080;
			if (this.linkLayer && this.multiplayer.busy) {
				this.linkLayer.startMultiplayerTransfer();
			}
		}
		this.irq = value & 0x4000;
		break;
	case this.SIO_UART:
		this.core.STUB('UART unsupported');
		break;
	case this.SIO_GPIO:
		// This register isn't used in general-purpose mode
		break;
	case this.SIO_JOYBUS:
		this.core.STUB('JOY BUS unsupported');
		break;
	}
};

GameBoyAdvanceSIO.prototype.readSIOCNT = function() {
	var value = (this.mode << 12) & 0xFFFF;
	switch (this.mode) {
	case this.SIO_NORMAL_8:
		this.core.STUB('8-bit transfer unsupported');
		break;
	case this.SIO_NORMAL_32:
		this.core.STUB('32-bit transfer unsupported');
		break;
	case this.SIO_MULTI:
		value |= this.multiplayer.baud;
		value |= this.multiplayer.si;
		value |= (!!this.sd) << 3;
		value |= this.multiplayer.id << 4;
		value |= this.multiplayer.error;
		value |= this.multiplayer.busy;
		value |= (!!this.multiplayer.irq) << 14;
		break;
	case this.SIO_UART:
		this.core.STUB('UART unsupported');
		break;
	case this.SIO_GPIO:
		// This register isn't used in general-purpose mode
		break;
	case this.SIO_JOYBUS:
		this.core.STUB('JOY BUS unsupported');
		break;
	}
	return value;
};

GameBoyAdvanceSIO.prototype.read = function(slot) {
	switch (this.mode) {
	case this.SIO_NORMAL_32:
		this.core.STUB('32-bit transfer unsupported');
		break;
	case this.SIO_MULTI:
		return this.multiplayer.states[slot];
	case this.SIO_UART:
		this.core.STUB('UART unsupported');
		break;
	default:
		this.core.WARN('Reading from transfer register in unsupported mode');
		break;
	}
	return 0;
};

function SRAMSavedata(size) {
	MemoryView.call(this, new ArrayBuffer(size), 0);

	this.writePending = false;
};

SRAMSavedata.prototype = Object.create(MemoryView.prototype);

SRAMSavedata.prototype.store8 = function(offset, value) {
	this.view.setInt8(offset, value);
	this.writePending = true;
};

SRAMSavedata.prototype.store16 = function(offset, value) {
	this.view.setInt16(offset, value, true);
	this.writePending = true;
};

SRAMSavedata.prototype.store32 = function(offset, value) {
	this.view.setInt32(offset, value, true);
	this.writePending = true;
};

function FlashSavedata(size) {
	MemoryView.call(this, new ArrayBuffer(size), 0);

	this.COMMAND_WIPE = 0x10;
	this.COMMAND_ERASE_SECTOR = 0x30;
	this.COMMAND_ERASE = 0x80;
	this.COMMAND_ID = 0x90;
	this.COMMAND_WRITE = 0xA0;
	this.COMMAND_SWITCH_BANK = 0xB0;
	this.COMMAND_TERMINATE_ID = 0xF0;

	this.ID_PANASONIC = 0x1B32;
	this.ID_SANYO = 0x1362;

	this.bank0 = new DataView(this.buffer, 0, 0x00010000);
	if (size > 0x00010000) {
		this.id = this.ID_SANYO;
		this.bank1 = new DataView(this.buffer, 0x00010000);
	} else {
		this.id = this.ID_PANASONIC;
		this.bank1 = null;
	}
	this.bank = this.bank0;

	this.idMode = false;
	this.writePending = false;

	this.first = 0;
	this.second = 0;
	this.command = 0;
	this.pendingCommand = 0;
};

FlashSavedata.prototype = Object.create(MemoryView.prototype);

FlashSavedata.prototype.load8 = function(offset) {
	if (this.idMode && offset < 2) {
		return (this.id >> (offset << 3)) & 0xFF;
	} else if (offset < 0x10000) {
		return this.bank.getInt8(offset);
	} else {
		return 0;
	}
};

FlashSavedata.prototype.load16 = function(offset) {
	return (this.load8(offset) & 0xFF) | (this.load8(offset + 1) << 8);
};

FlashSavedata.prototype.load32 = function(offset) {
	return (this.load8(offset) & 0xFF) | (this.load8(offset + 1) << 8) | (this.load8(offset + 2) << 16) | (this.load8(offset + 3) << 24);
};

FlashSavedata.prototype.loadU8 = function(offset) {
	return this.load8(offset) & 0xFF;
};

FlashSavedata.prototype.loadU16 = function(offset) {
	return (this.loadU8(offset) & 0xFF) | (this.loadU8(offset + 1) << 8);
};

FlashSavedata.prototype.store8 = function(offset, value) {
	switch (this.command) {
	case 0:
		if (offset == 0x5555) {
			if (this.second == 0x55) {
				switch (value) {
				case this.COMMAND_ERASE:
					this.pendingCommand = value;
					break;
				case this.COMMAND_ID:
					this.idMode = true;
					break;
				case this.COMMAND_TERMINATE_ID:
					this.idMode = false;
					break;
				default:
					this.command = value;
					break;
				}
				this.second = 0;
				this.first = 0;
			} else {
				this.command = 0;
				this.first = value;
				this.idMode = false;
			}
		} else if (offset == 0x2AAA && this.first == 0xAA) {
			this.first = 0;
			if (this.pendingCommand) {
				this.command = this.pendingCommand;
			} else {
				this.second = value;
			}
		}
		break;
	case this.COMMAND_ERASE:
		switch (value) {
		case this.COMMAND_WIPE:
			if (offset == 0x5555) {
				for (var i = 0; i < this.view.byteLength; i += 4) {
					this.view.setInt32(i, -1);
				}
			}
			break;
		case this.COMMAND_ERASE_SECTOR:
			if ((offset & 0x0FFF) == 0) {
				for (var i = offset; i < offset + 0x1000; i += 4) {
					this.bank.setInt32(i, -1);
				}
			}
			break;
		}
		this.pendingCommand = 0;
		this.command = 0;
		break;
	case this.COMMAND_WRITE:
		this.bank.setInt8(offset, value);
		this.command = 0;

		this.writePending = true;
		break;
	case this.COMMAND_SWITCH_BANK:
		if (this.bank1 && offset == 0) {
			if (value == 1) {
				this.bank = this.bank1;
			} else {
				this.bank = this.bank0;
			}
		}
		this.command = 0;
		break;
	}
};

FlashSavedata.prototype.store16 = function(offset, value) {
	throw new Error("Unaligned save to flash!");
};

FlashSavedata.prototype.store32 = function(offset, value) {
	throw new Error("Unaligned save to flash!");
};

FlashSavedata.prototype.replaceData = function(memory) {
	var bank = this.view === this.bank1;
	MemoryView.prototype.replaceData.call(this, memory, 0);

	this.bank0 = new DataView(this.buffer, 0, 0x00010000);
	if (memory.byteLength > 0x00010000) {
		this.bank1 = new DataView(this.buffer, 0x00010000);
	} else {
		this.bank1 = null;
	}
	this.bank = bank ? this.bank1 : this.bank0;
};

function EEPROMSavedata(size, mmu) {
	MemoryView.call(this, new ArrayBuffer(size), 0);

	this.writeAddress = 0;
	this.readBitsRemaining = 0;
	this.readAddress = 0;

	this.command = 0;
	this.commandBitsRemaining = 0;

	this.realSize = 0;
	this.addressBits = 0;
	this.writePending = false;

	this.dma = mmu.core.irq.dma[3];

	this.COMMAND_NULL = 0;
	this.COMMAND_PENDING = 1;
	this.COMMAND_WRITE = 2;
	this.COMMAND_READ_PENDING = 3;
	this.COMMAND_READ = 4;
};

EEPROMSavedata.prototype = Object.create(MemoryView.prototype);

EEPROMSavedata.prototype.load8 = function(offset) {
	throw new Error("Unsupported 8-bit access!");
};

EEPROMSavedata.prototype.load16 = function(offset) {
	return this.loadU16(offset);
};

EEPROMSavedata.prototype.loadU8 = function(offset) {
	throw new Error("Unsupported 8-bit access!");
};

EEPROMSavedata.prototype.loadU16 = function(offset) {
	if (this.command != this.COMMAND_READ || !this.dma.enable) {
		return 1;
	}
	--this.readBitsRemaining;
	if (this.readBitsRemaining < 64) {
		var step = 63 - this.readBitsRemaining;
		var data = this.view.getUint8((this.readAddress + step) >> 3, false) >> (0x7 - (step & 0x7));
		if (!this.readBitsRemaining) {
			this.command = this.COMMAND_NULL;
		}
		return data & 0x1;
	}
	return 0;
};

EEPROMSavedata.prototype.load32 = function(offset) {
	throw new Error("Unsupported 32-bit access!");
};

EEPROMSavedata.prototype.store8 = function(offset, value) {
	throw new Error("Unsupported 8-bit access!");
};

EEPROMSavedata.prototype.store16 = function(offset, value) {
	switch (this.command) {
	// Read header
	case this.COMMAND_NULL:
	default:
		this.command = value & 0x1;
		break;
	case this.COMMAND_PENDING:
		this.command <<= 1;
		this.command |= value & 0x1;
		if (this.command == this.COMMAND_WRITE) {
			if (!this.realSize) {
				var bits = this.dma.count - 67;
				this.realSize = 8 << bits;
				this.addressBits = bits;
			}
			this.commandBitsRemaining = this.addressBits + 64 + 1;
			this.writeAddress = 0;
		} else {
			if (!this.realSize) {
				var bits = this.dma.count - 3;
				this.realSize = 8 << bits;
				this.addressBits = bits;
			}
			this.commandBitsRemaining = this.addressBits + 1;
			this.readAddress = 0;
		}
		break;
	// Do commands
	case this.COMMAND_WRITE:
		// Write
		if (--this.commandBitsRemaining > 64) {
			this.writeAddress <<= 1;
			this.writeAddress |= (value & 0x1) << 6;
		} else if (this.commandBitsRemaining <= 0) {
			this.command = this.COMMAND_NULL;
			this.writePending = true;
		} else {
			var current = this.view.getUint8(this.writeAddress >> 3);
			current &= ~(1 << (0x7 - (this.writeAddress & 0x7)));
			current |= (value & 0x1) << (0x7 - (this.writeAddress & 0x7));
			this.view.setUint8(this.writeAddress >> 3, current);
			++this.writeAddress;
		}
		break;
	case this.COMMAND_READ_PENDING:
		// Read
		if (--this.commandBitsRemaining > 0) {
			this.readAddress <<= 1;
			if (value & 0x1) {
				this.readAddress |= 0x40;
			}
		} else {
			this.readBitsRemaining = 68;
			this.command = this.COMMAND_READ;
		}
		break;
	}
};

EEPROMSavedata.prototype.store32 = function(offset, value) {
	throw new Error("Unsupported 32-bit access!");
};

EEPROMSavedata.prototype.replaceData = function(memory) {
	MemoryView.prototype.replaceData.call(this, memory, 0);
};

function GameBoyAdvanceGPIO(core, rom) {
	this.core = core;
	this.rom = rom;

	this.readWrite = 0;
	this.direction = 0;

	this.device = new GameBoyAdvanceRTC(this); // TODO: Support more devices
};

GameBoyAdvanceGPIO.prototype.store16 = function(offset, value) {
	switch (offset) {
	case 0xC4:
		this.device.setPins(value & 0xF);
		break;
	case 0xC6:
		this.direction = value & 0xF;
		this.device.setDirection(this.direction);
		break;
	case 0xC8:
		this.readWrite = value & 1;
		break;
	default:
		throw new Error('BUG: Bad offset passed to GPIO: ' + offset.toString(16));
	}
	if (this.readWrite) {
		var old = this.rom.view.getUint16(offset, true);
		old &= ~this.direction;
		this.rom.view.setUint16(offset, old | (value & this.direction), true);
	}
};

GameBoyAdvanceGPIO.prototype.outputPins = function(nybble) {
	if (this.readWrite) {
		var old = this.rom.view.getUint16(0xC4, true);
		old &= this.direction;
		this.rom.view.setUint16(0xC4, old | (nybble & ~this.direction & 0xF), true);
	}
};

function GameBoyAdvanceRTC(gpio) {
	this.gpio = gpio;

	// PINOUT: SCK | SIO | CS | -
	this.pins = 0;
	this.direction = 0;

	this.totalBytes = [
		0, // Force reset
		0, // Empty
		7, // Date/Time
		0, // Force IRQ
		1, // Control register
		0, // Empty
		3, // Time
		0 // Empty
	];
	this.bytesRemaining = 0;

	// Transfer sequence:
	// == Initiate
	// > HI | - | LO | -
	// > HI | - | HI | -
	// == Transfer bit (x8)
	// > LO | x | HI | -
	// > HI | - | HI | -
	// < ?? | x | ?? | -
	// == Terminate
	// >  - | - | LO | -
	this.transferStep = 0;

	this.reading = 0;
	this.bitsRead = 0;
	this.bits = 0;
	this.command = -1;

	this.control = 0x40;
	this.time = [
		0, // Year
		0, // Month
		0, // Day
		0, // Day of week
		0, // Hour
		0, // Minute
		0 // Second
	];
};

GameBoyAdvanceRTC.prototype.setPins = function(nybble) {
	switch (this.transferStep) {
	case 0:
		if ((nybble & 5) == 1) {
			this.transferStep = 1;
		}
		break;
	case 1:
		if (nybble & 4) {
			this.transferStep = 2;
		}
		break;
	case 2:
		if (!(nybble & 1)) {
			this.bits &= ~(1 << this.bitsRead);
			this.bits |= ((nybble & 2) >> 1) << this.bitsRead;
		} else {
			if (nybble & 4) {
				// SIO direction should always != this.read
				if ((this.direction & 2) && !this.read) {
					++this.bitsRead;
					if (this.bitsRead == 8) {
						this.processByte();
					}
				} else {
					this.gpio.outputPins(5 | (this.sioOutputPin() << 1));
					++this.bitsRead;
					if (this.bitsRead == 8) {
						--this.bytesRemaining;
						if (this.bytesRemaining <= 0) {
							this.command = -1;
						}
						this.bitsRead = 0;
					}
				}
			} else {
				this.bitsRead = 0;
				this.bytesRemaining = 0;
				this.command = -1;
				this.transferStep = 0;
			}
		}
		break;
	}

	this.pins = nybble & 7;
};

GameBoyAdvanceRTC.prototype.setDirection = function(direction) {
	this.direction = direction;
};

GameBoyAdvanceRTC.prototype.processByte = function() {
	--this.bytesRemaining;
	switch (this.command) {
	case -1:
		if ((this.bits & 0x0F) == 0x06) {
			this.command = (this.bits >> 4) & 7;
			this.reading = this.bits & 0x80;

			this.bytesRemaining = this.totalBytes[this.command];
			switch (this.command) {
			case 0:
				this.control = 0;
				break;
			case 2:
			case 6:
				this.updateClock();
				break;
			}
		} else {
			this.gpio.core.WARN('Invalid RTC command byte: ' + this.bits.toString(16));
		}
		break;
	case 4:
		// Control
		this.control = this.bits & 0x40;
		break;
	}	
	this.bits = 0;
	this.bitsRead = 0;
	if (!this.bytesRemaining) {
		this.command = -1;
	}
};

GameBoyAdvanceRTC.prototype.sioOutputPin = function() {
	var outputByte = 0;
	switch (this.command) {
	case 4:
		outputByte = this.control;
		break;
	case 2:
	case 6:
		outputByte = this.time[7 - this.bytesRemaining];
		break;
	}
	var output = (outputByte >> this.bitsRead) & 1;
	return output;
};

GameBoyAdvanceRTC.prototype.updateClock = function() {
	var date = new Date();
	this.time[0] = this.bcd(date.getFullYear());
	this.time[1] = this.bcd(date.getMonth() + 1);
	this.time[2] = this.bcd(date.getDate());
	this.time[3] = date.getDay() - 1;
	if (this.time[3] < 0) {
		this.time[3] = 6;
	}
	if (this.control & 0x40) {
		// 24 hour
		this.time[4] = this.bcd(date.getHours());
	} else {
		this.time[4] = this.bcd(date.getHours() % 2);
		if (date.getHours() >= 12) {
			this.time[4] |= 0x80;
		}
	}
	this.time[5] = this.bcd(date.getMinutes());
	this.time[6] = this.bcd(date.getSeconds());
};

GameBoyAdvanceRTC.prototype.bcd = function(binary) {
	var counter = binary % 10;
	binary /= 10;
	counter += (binary % 10) << 4;
	return counter;
};

function GameBoyAdvance() {
	this.LOG_ERROR = 1;
	this.LOG_WARN = 2;
	this.LOG_STUB = 4;
	this.LOG_INFO = 8;
	this.LOG_DEBUG = 16;

	this.SYS_ID = 'com.endrift.gbajs';

	this.logLevel = this.LOG_ERROR | this.LOG_WARN;

	this.rom = null;

	this.cpu = new ARMCore();
	this.mmu = new GameBoyAdvanceMMU()
	this.irq = new GameBoyAdvanceInterruptHandler();
	this.io = new GameBoyAdvanceIO();
	this.audio = new GameBoyAdvanceAudio();
	this.video = new GameBoyAdvanceVideo();
	this.keypad = new GameBoyAdvanceKeypad();
	this.sio = new GameBoyAdvanceSIO();

	// TODO: simplify this graph
	this.cpu.mmu = this.mmu;
	this.cpu.irq = this.irq;

	this.mmu.cpu = this.cpu;
	this.mmu.core = this;

	this.irq.cpu = this.cpu;
	this.irq.io = this.io;
	this.irq.audio = this.audio;
	this.irq.video = this.video;
	this.irq.core = this;

	this.io.cpu = this.cpu;
	this.io.audio = this.audio;
	this.io.video = this.video;
	this.io.keypad = this.keypad;
	this.io.sio = this.sio;
	this.io.core = this;

	this.audio.cpu = this.cpu;
	this.audio.core = this;

	this.video.cpu = this.cpu;
	this.video.core = this;

	this.keypad.core = this;

	this.sio.core = this;

	this.keypad.registerHandlers();
	this.doStep = this.waitFrame;
	this.paused = false;

	this.seenFrame = false;
	this.seenSave = false;
	this.lastVblank = 0;

	this.queue = null;
	this.reportFPS = null;
	this.throttle = 16; // This is rough, but the 2/3ms difference gives us a good overhead

	var self = this;
	window.queueFrame = function (f) {
		self.queue = window.setTimeout(f, self.throttle);
	};

	window.URL = window.URL || window.webkitURL;

	this.video.vblankCallback = function() {
		self.seenFrame = true;
	};
};

GameBoyAdvance.prototype.setCanvas = function(canvas) {
	var self = this;
	if (canvas.offsetWidth != 240 || canvas.offsetHeight != 160) {
		this.indirectCanvas = document.createElement("canvas");
		this.indirectCanvas.setAttribute("height", "160");
		this.indirectCanvas.setAttribute("width", "240");
		this.targetCanvas = canvas;
		this.setCanvasDirect(this.indirectCanvas);
		var targetContext = canvas.getContext('2d');
		this.video.drawCallback = function() {
			targetContext.drawImage(self.indirectCanvas, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
		}
	} else {
		this.setCanvasDirect(canvas);
		var self = this;
	}
};

GameBoyAdvance.prototype.setCanvasDirect = function(canvas) {
	this.context = canvas.getContext('2d');
	this.video.setBacking(this.context);
};

GameBoyAdvance.prototype.setBios = function(bios, real) {
	this.mmu.loadBios(bios, real);
};

GameBoyAdvance.prototype.setRom = function(rom) {
	this.reset();

	this.rom = this.mmu.loadRom(rom, true);
	if (!this.rom) {
		return false;
	}
	this.retrieveSavedata();
	return true;
};

GameBoyAdvance.prototype.hasRom = function() {
	return !!this.rom;
};

GameBoyAdvance.prototype.loadRomFromFile = function(romFile, callback) {
	var reader = new FileReader();
	var self = this;
	reader.onload = function(e) {
		var result = self.setRom(e.target.result);
		if (callback) {
			callback(result);
		}
	}
	reader.readAsArrayBuffer(romFile);
};

GameBoyAdvance.prototype.reset = function() {
	this.audio.pause(true);

	this.mmu.clear();
	this.io.clear();
	this.audio.clear();
	this.video.clear();
	this.sio.clear();

	this.mmu.mmap(this.mmu.REGION_IO, this.io);
	this.mmu.mmap(this.mmu.REGION_PALETTE_RAM, this.video.renderPath.palette);
	this.mmu.mmap(this.mmu.REGION_VRAM, this.video.renderPath.vram);
	this.mmu.mmap(this.mmu.REGION_OAM, this.video.renderPath.oam);

	this.cpu.resetCPU(0);
};

GameBoyAdvance.prototype.step = function() {
	while (this.doStep()) {
		this.cpu.step();
	}
};

GameBoyAdvance.prototype.waitFrame = function() {
	var seen = this.seenFrame;
	this.seenFrame = false;
	return !seen;
};

GameBoyAdvance.prototype.pause = function() {
	this.paused = true;
	this.audio.pause(true);
	if (this.queue) {
		clearTimeout(this.queue);
		this.queue = null;
	}
};

GameBoyAdvance.prototype.advanceFrame = function() {
	this.step();
	if (this.seenSave) {
		if (!this.mmu.saveNeedsFlush()) {
			this.storeSavedata();
			this.seenSave = false;
		} else {
			this.mmu.flushSave();
		}
	} else if (this.mmu.saveNeedsFlush()) {
		this.seenSave = true;
		this.mmu.flushSave();
	}
};

GameBoyAdvance.prototype.runStable = function() {
	if (this.interval) {
		return; // Already running
	}
	var self = this;
	var timer = 0;
	var frames = 0;
	var runFunc;
	var start = Date.now();
	this.paused = false;
	this.audio.pause(false);

	if (this.reportFPS) {
		runFunc = function() {
			try {
				timer += Date.now() - start;
				if (self.paused) {
					return;
				} else {
					queueFrame(runFunc);
				}
				start = Date.now();
				self.advanceFrame();
				++frames;
				if (frames == 60) {
					self.reportFPS((frames * 1000) / timer);
					frames = 0;
					timer = 0;
				}
			} catch(exception) {
				self.ERROR(exception);
				if (exception.stack) {
					self.logStackTrace(exception.stack.split('\n'));
				}
				throw exception;
			}
		};
	} else {
		runFunc = function() {
			try {
				if (self.paused) {
					return;
				} else {
					queueFrame(runFunc);
				}
				self.advanceFrame();
			} catch(exception) {
				self.ERROR(exception);
				if (exception.stack) {
					self.logStackTrace(exception.stack.split('\n'));
				}
				throw exception;
			}
		};
	}
	queueFrame(runFunc);
};

GameBoyAdvance.prototype.setSavedata = function(data) {
	this.mmu.loadSavedata(data);
};

GameBoyAdvance.prototype.loadSavedataFromFile = function(saveFile) {
	var reader = new FileReader();
	var self = this;
	reader.onload = function(e) { self.setSavedata(e.target.result); }
	reader.readAsArrayBuffer(saveFile);
};

GameBoyAdvance.prototype.decodeSavedata = function(string) {
	this.setSavedata(this.decodeBase64(string));
};

GameBoyAdvance.prototype.decodeBase64 = function(string) {
	var length = (string.length * 3 / 4);
	if (string[string.length - 2] == '=') {
		length -= 2;
	} else if (string[string.length - 1] == '=') {
		length -= 1;
	}
	var buffer = new ArrayBuffer(length);
	var view = new Uint8Array(buffer);
	var bits = string.match(/..../g);
	for (var i = 0; i + 2 < length; i += 3) {
		var s = atob(bits.shift());
		view[i] = s.charCodeAt(0);
		view[i + 1] = s.charCodeAt(1);
		view[i + 2] = s.charCodeAt(2);
	}
	if (i < length) {
		var s = atob(bits.shift());
		view[i++] = s.charCodeAt(0);
		if (s.length > 1) {
			view[i++] = s.charCodeAt(1);
		}
	}

	return buffer;
};

GameBoyAdvance.prototype.encodeBase64 = function(view) {
	var data = [];
	var b;
	var wordstring = [];
	var triplet;
	for (var i = 0; i < view.byteLength; ++i) {
		b = view.getUint8(i, true);
		wordstring.push(String.fromCharCode(b));
		while (wordstring.length >= 3) {
			triplet = wordstring.splice(0, 3);
			data.push(btoa(triplet.join('')));
		}
	};
	if (wordstring.length) {
		data.push(btoa(wordstring.join('')));
	}
	return data.join('');
};

GameBoyAdvance.prototype.downloadSavedata = function() {
	var sram = this.mmu.save;
	if (!sram) {
		this.WARN("No save data available");
		return null;
	}
	if (window.URL) {
		var url = window.URL.createObjectURL(new Blob([sram.buffer], { type: 'application/octet-stream' }));
		window.open(url);
	} else {
		var data = this.encodeBase64(sram.view);
		window.open('data:application/octet-stream;base64,' + data, this.rom.code + '.sav');
	}
};


GameBoyAdvance.prototype.storeSavedata = function() {
	var sram = this.mmu.save;
	try {
		var storage = window.localStorage;
		storage[this.SYS_ID + '.' + this.mmu.cart.code] = this.encodeBase64(sram.view);
	} catch (e) {
		this.WARN('Could not store savedata! ' + e);
	}
};

GameBoyAdvance.prototype.retrieveSavedata = function() {
	try {
		var storage = window.localStorage;
		var data = storage[this.SYS_ID + '.' + this.mmu.cart.code];
		if (data) {
			this.decodeSavedata(data);
			return true;
		}
	} catch (e) {
		this.WARN('Could not retrieve savedata! ' + e);
	}
	return false;
};

GameBoyAdvance.prototype.freeze = function() {
	return {
		'cpu': this.cpu.freeze(),
		'mmu': this.mmu.freeze(),
		'irq': this.irq.freeze(),
		'io': this.io.freeze(),
		'audio': this.audio.freeze(),
		'video': this.video.freeze()
	}
};

GameBoyAdvance.prototype.defrost = function(frost) {
	this.cpu.defrost(frost.cpu);
	this.mmu.defrost(frost.mmu);
	this.audio.defrost(frost.audio);
	this.video.defrost(frost.video);
	this.irq.defrost(frost.irq);
	this.io.defrost(frost.io);
};

GameBoyAdvance.prototype.log = function(level, message) {};

GameBoyAdvance.prototype.setLogger = function(logger) {
	this.log = logger;
};

GameBoyAdvance.prototype.logStackTrace = function(stack) {
	var overflow = stack.length - 32;
	this.ERROR('Stack trace follows:');
	if (overflow > 0) {
		this.log(-1, '> (Too many frames)');
	}
	for (var i = Math.max(overflow, 0); i < stack.length; ++i) {
		this.log(-1, '> ' + stack[i]);
	}
};

GameBoyAdvance.prototype.ERROR = function(error) {
	if (this.logLevel & this.LOG_ERROR) {
		this.log(this.LOG_ERROR, error);
	}
};

GameBoyAdvance.prototype.WARN = function(warn) {
	if (this.logLevel & this.LOG_WARN) {
		this.log(this.LOG_WARN, warn);
	}
};

GameBoyAdvance.prototype.STUB = function(func) {
	if (this.logLevel & this.LOG_STUB) {
		this.log(this.LOG_STUB, func);
	}
};

GameBoyAdvance.prototype.INFO = function(info) {
	if (this.logLevel & this.LOG_INFO) {
		this.log(this.LOG_INFO, info);
	}
};

GameBoyAdvance.prototype.DEBUG = function(info) {
	if (this.logLevel & this.LOG_DEBUG) {
		this.log(this.LOG_DEBUG, info);
	}
};

GameBoyAdvance.prototype.ASSERT_UNREACHED = function(err) {
	throw new Error("Should be unreached: " + err);
};

GameBoyAdvance.prototype.ASSERT = function(test, err) {
	if (!test) {
		throw new Error("Assertion failed: " + err);
	}
};

var BSR_BIOS_B64="BgAA6v7//+oFAADq/v//6v7//+oAAKDhDAAA6v7//+oC86DjAABd4wHToAMg0E0CAEAt6QIAXuUEAFDjCQAACwUAUOMHAAALAEC96A7wsOEPUC3pAQOg4wDgj+IE8BDlD1C96ATwXuIQQC3pBNBN4rAQzeEBQ6DjAkyE4rAA1OGyAM3hsBDd4QEAgOGwAMThAUOg4x8AoOMA8CnhAACg4wEDxOXTAKDjAPAp4bgAVOGwEN3hABAR4AAQIRC4EEQR8///CgFDoOMCTITisgDd4bAAxOEE0I3iEIC96A==";
var BSR_ROM_B64="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AIAAgACAAIAIgACAAIAAgACAAIAAgACAB4AIgACAAIADgAOAAIAAgAqAAIAAgACAAIAAgACAAYAAgACAAIAAgACAAIAAgAGAAIAAgACACoAAgAqAAIADgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaACoAAgACACYAAgACAAIAAgACAAIAAgACAAYAAgAiAAIAAgACABIAAgACAAoAAgACAAIAAgACAAIAAgACAAIAGgAqAAIAAgACAAIAAgACAAIAAgAmAAIAAgASAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaAAIAAgACAAIABgACAAIAAgACAAIABgACAAIAAgACAAIAAgASAAIAAgACAAIAFgACAAoAAgAeAAIAAgAOAAIAJgACAAIAAgASAAIAAgACAAIAAgACAAIAAgACABIAKgACAAIAAgASAAIAAgACAAIAAgACAAIABgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACIAAgACAAIAAgACAAIAAgACACYAAgAaABoACgACAAIAAgACAAIAAgACAAIAAgACAAoAGgACAAIAAgAaAAIAEgASAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAEgAqAAIAJgACAAoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgASAAIAAgACAAIAAgAeAAIAAgACAA4AAgAOAAIAKgAOAAIAAgAKAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgASAAIAAgACAAIADgACAAIAAgACAAIAFgACAAYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA4AAgACAAIAAgAKAAIAAgACAAIAAgACAAIAAgAqACIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACACYAAgACAAIAAgACAAIAAgAKACYAAgAeAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAIAAgACAA4AAgACAAIAAgAKAAIAAgACAAIAAgACACoAAgACACIAAgACAAIAAgAGAAIAAgACAAIAFgACAB4AKgACAAIAAgACAAIAAgAmAAIAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACoAAgACAAIAAgACAAIAAgACAAIAHgAOAAIAHgACAAIAAgACAAIAAgACAAIAAgACAAoAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAoAAgAeAAIAAgACAAIABgACABIAAgACAAIAAgACAA4AAgACAAIAAgACAAIADgACAAoAFgASAAIAAgACAAIAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACACoAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgACAAIAAgASAAIAAgACAAIAAgAaABYAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACAAIAAgACAAIAIgACAAIAAgAeAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgAeAAIAAgACAAIAAgAqAAIAAgAmAAIAAgACAAIAAgACAAIAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACACoAAgAiAAIAAgACAAIAIgACAB4AEgAWAAIAAgAqAAIAAgAWAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgAaAAIAAgAeAAIAKgACAAIAAgAmAAIAAgACAAIAAgAqAAIAAgACABoAAgACAAIAAgAKACYAKgACAAIABgAqAAIAAgACAAIABgACAAIAAgAeAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAFgACAAIAAgACAAIAHgAWAAIAAgACAAIAAgACAAYAAgACAAIAAgACAAIAAgAqAAIAAgACAAIAAgACAAIAEgACAA4AAgACAAIAAgACAAIAAgACAAIAJgACACIAAgACAAIAAgACAAIAAgACACIAAgACAAIAAgAOAAIAAgACAAIAAgAmAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAoAAgACAAIAAgACAA4AAgACAAIAAgACABIAKgACAAIAAgACAAIABgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAGAAIAAgAaAAIAAgACAB4AAgACAAIAJgACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQC5AMkA2QDpAPkBCQAJAAkACQEZASkBOQAJAUkBWQFpAAkACQDpAPkBCQAJAXkBiQGZAAkACQGpAbkACQAJAAkC2QLpAAkACQL5AAkACQAJAAkDCQMZAAkACQAJAykACQAJAAkACQL5AAkACQAJAzkACQAJAAkDSQNZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkD6QAJA/kACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkEGQAJAAkACQAJAAkACQAJAAkEKQAJAAkACQAJAAkECQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBEkACQAJAAkACQAJBFkACQRpAAkACQAJAAkACQAJAAkACQAJBDkACQAJAAkACQAJAAkACQAJBBkACQAJAAkACQAJAAkACQAJAAkACQAJBHkACQAJAAkACQAJAAkACQAJAAkEiQSpBLkACQAJAAkACQAJAAkACQAJAAkACQAJBMkACQAJAAkACQAJBNkACQAJAAkACQAJAAkACQAJAAkACQAJBOkACQAJAAkACQAJBQkACQAJBRkACQAJAAkACQUpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBTkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQVZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFaQV5AAkACQAJAAkACQWJAAkACQAJBZkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBbkACQAJAAkACQAJAAkACQAJBckF2QAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBekACQAJAAkACQAJAAkACQX5AAkACQAJBgkACQAJAAkACQAJAAkACQAJAAkGGQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBjkGSQZZBmkGeQaJAAkGmQapBrkGyQbZBukG+QAJBwkHGQcpBzkHSQdZB2kHeQeJB5kHqQAJB7kHyQfZB+kH+QlpCXkJiQmZCakJuQnJCdkJ6Qn5CgkKGQopCjkKSQpZCmkKeQqJCpkKqQq5CskK2QrpCvkLCQsZCykLOQtJC1kNSQ1ZDWkNeQ2JDZkNqQ2JDbkNyQ3ZDekN+Q3JDgkNuQ4ZDikOOQ5JDlkN6Q5pDnkOiQ2ZDnkNSQ1ZDpkN6Q6pD7kPyQ/ZD+kP+QAJEBkQKRA5EEkQWRBpEHkQiRCZEKkQuRDJENkQ6RD5EQkRGREpETkRSRFZEWkReRGJEZkRqRZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZA5kTqRZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQP5FlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkESRZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBLkUyRZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkFWRVpFXkWWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBjkQCQZJFlkWWQZZBlkGWQZZBlkGWQWJFmkT6RZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkG6Rb5EAkACQcJFxkWWQZZBlkGWQZZBykXORAJB0kXWRdpF3kVGRZZBlkGWQZZB+kX+RgJFlkGWQZZBlkIGRgpFvkQCQAJAAkACQAJCDkYSRhZGGkYeRb5EAkACQAJAAkACQAJCPkZCRdpGRkZKRAJAAkACQk5FekXaRlJGMkQCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAckB2QAJAAkB6QH5AgkACQAJAhkCKQI5AAkCSQJZAmkACQAJAnkCiQAJAAkACQKZAqkACQAJAAkCuQLJAAkACQAJAAkACQAJAAkDaQN5AAkACQAJA4kDmQAJAwkDqQO5AAkACQPJA9kACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQQJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkEOQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkEmQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQR5AAkE+QAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFSQA5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQWJAAkACQAJAAkACQAJAAkACQAJAAkACQTZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFqQAJAAkACQAJAAkACQAJAAkACQAJAGkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkGKQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBfkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkICQgZAAkACQAJAAkIKQg5CEkGWQhZCGkIeQiJAAkImQipAAkIuQjJCNkI6Qj5CQkACQAJAAkJGQkpCTkJSQlZC2kLeQuJC5kLqQu5C8kL2QvpC/kJaQwJDBkMKQw5DEkMWQxpDHkMiQyZDKkMuQzJDNkM6Qz5DQkMCQ0ZDSkNOQ65DskO2Q7pDckNmQ75DwkN6Q8ZDYkOWQ8pDzkOGQ3ZDekPSQ3pD1kPaQ3pD3kPiQ3pD5kPOQ+pDlkPGQ65DXkBuRHJEdkR6RH5EUkRWRIJEhkSKRI5EkkSWRJpEnkSiRKZEqkSuRLJEtkS6RL5EwkTGRMpEzkTSRNZE2kTeROJFlkGWQZZA7kTyRZZBlkGWQZZBlkGWQZZBlkGWQZZA9kQCQPpFlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQZZBlkGWQQJFlkGWQZZBlkGWQZZBlkGWQZZBlkGWQQZEAkEKRZZBlkGWQZZBlkGWQZZBDkWWQZZBlkGWQZZBlkGWQZZBlkEWRRpFlkGWQZZBlkGWQZZBlkGWQZZBlkEeRAJBIkWWQZZBlkGWQZZBlkEmRSpFlkGWQZZBlkGWQZZBlkGWQTZEAkE6RZZBlkGWQZZBlkGWQZZBlkGWQZZBPkQCQAJBQkVGRZZBlkGWQUpFTkVSRZZBlkGWQZZBlkGWQZZBYkVmRAJBakWWQZZBlkGWQZZBlkGWQZZBlkFuRXJEAkACQAJBdkV6RX5FgkQCQAJBhkWKRZZBlkGWQZZBlkGeRaJEAkACQAJBpkWWQZZBlkGWQZZBlkGWQapFrkQCQAJAAkACQAJAAkACQAJAAkACQAJBskW2RZZBlkGWQZZAAkACQAJAAkACQZJF4kT6RZZBlkGWQZZB5kXqRAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJB7kXyRfZFlkGWQAJAAkACQAJAAkACQAJCIkYmRhZGKkYuRjJEAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkGSRjZGOkQCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAADEBAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEwAAAAEAAAAAIBIRESASEREgIhERICIRESAiEREAIhIRACIiEQAgIiIRERERERERERERESEREREhERERIRERESIRESEiESEiIiIAAAAiAAAAIgAAACIAAAAiAAAAAgAAAAIAAAAAAAAAAAAAIAAAACAAAAAgAAAAIAAAAAAAAAAAAAAAAAAAAAASEREREhERESIREREiERERIhIRESIiESEgIiIiACIiIhEiAAARIgAAISIAACEiAAAiAgAAIgIAACIAAAACAAAAAAAiEQAAIhEAACISAAAiEgAAICIAACAiAAAAIgAAACIRERERERERERERERERERERERERIRIRESIiESEiIiIiIiECAAAhAgAAIgIAACICAAAiAAAAIgAAAAIAAAACAAAAAAAiEQAAIhEAACISAAAiEgAAICIAACAiAAAAIgAAACAREREhERERIRERESIREREiEREhIhIRIiIiIiICIiIiAAIAAAACAAAAAgAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAAACIAAAAiAAAAIgAAACAAAAAgAAAAAAAAAAARERERERERERIRERESERERIhERISISESIiIiIiICIiIiECAAAhAgAAIgIAACICAAAiAAAAIgAAAAIAAAAAAAAAIBIRESASEREgIhERICIREQAiEhEAIiIRACAiIgAAIiIRESIAEREiABEhIgARISIAESICACEiAgAiIgAAIgIAAAAAACIAAAAiAAAAIgAAACAAAAAgAAAAAAAAAAAAAAAAEREhAhIRIgISESICIiEiACIiIgAiIgIAICIAAAAAAAAAAAAgAAAAIAAAACAAAAAgAAAAIAAAAAAAAAAAAAAAABIRERESERERIhERESIREREiERERIhIRESIiEREgIiIRERERIhERESIRESEiEREhIhERISIRESICESEiAiEiIgAAAAAiAAAAIgAAACIAAAAiAAAAIgAAACAAAAAgAAAAABEREREREREREhERERIRERESERERIhERESISEREiIhIREREhAhERIQIRESICEREiAhERIgIRISIAESIiACIiAgAAACIRAAAiEQAAIhIAACISAAAiEgAAICIAACAiAAAAIhERERERERERERERERERERERERERERERERIREREiEhEiESECABEhAgARIgIAESICABEiAgAhIgAAIiIAACICAAAAIhERACIREQAiEhEAIhIRACAiEQAgIhIAACIiAAAgIhERIQIRESECEREiAhERIgIRISIAESIiACIiAgAiIgAAAAAgEgAAICIAACAiAAAAIgAAACIAAAAgAAAAAAAAAAARESIAESEiABEhIgASIgIAIiICACIiAAAiAgAAAAAAAAAgEhEAIBIRACAiEQAgIhEAACISAAAiIgAAICIAAAAgEREiABERIgARISIAESEiABEiAgAiIgIAIiIAACIAAAAAACIiAAAgIgAAACAAAAAAAAAAAAAAAAAAAAAAAAAAACIiIgIiIiIAIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiIiIgIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiIiACAiIgAAICIAAAAAAAAAAAAAAAAAAAAAAAAAACIiAgAiIgAAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIiIgAiIiIAACIiAAAAAAAAAAAAAAAAAAAAAAAAAAAiIgAAIgIAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiIiIiIiIiACIiAgAAAAAAAAAAAAAAAAAAAAAAAAAAIgAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAEBDAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEMAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEMAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAEAABAQwAAAAQAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAABDAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAABAQwAAAAQAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQwAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAABAAAAANAQAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAFVVAFVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAAFBQVVVVVVVVVVVVVVVVVVZVVVVVVVVVVlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVQAAAABVAAAAVVUFAFVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAFUAAABVVQAAVVVVAFVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAVQAAVVUAVVVVVVVVVQAAAAAAAABVAFBVVVVVVVVVVlVVVVVVVVVWVVVVVVVVAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSJVVVVVVVVVVVVVVVVVVVVVVVVWVVVVVVVVVVZVIiJSVQUAAABVVVUFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAABVAAAAVVUFAFVVVQZVVVVVVVVVVlVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAABVBQAAVVUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAAAiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiAgAiIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAJSIAAAAAAAAAAAAAAFAAAFVVAFVVVVVVVVVVVVVVIiJVVQAAAFAAVVVVVVVVVVVVVVVVVVVWVVVVVVVVVVZVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIiJVVQAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIlJVVQAAAAAFAAAAVVUAAFVVVQVWVVVVVVVVVVZVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAAUAAABVBQAAVVUFAFVVVQUAAAAAAAAAAAAAAAAAAAAAAAAAUAAAUFUAUFVVAFVVVQAAAAAAAABQAFBVVVBVVVVVVVZVVVVVVVVVVlVVVVVVAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVQAAAABVVQAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAVQAAAFVVAABVVVUAVVVVVVVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAFBVAAAAAAAAAAAAAAAAAABQVQBQVVZQVVVVVVVVVlVVVVUAAAAAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBQBVVVVVVVVVVVVVVVVWVVVVVVVVVVZVJSJVJSIiAAAAAFUAAABVVQUAVVVVVVVVVVVVVVVVIiJVVSIiIlUAAAAAAAAAAAAAAAAAAAAAVQAAAFVVAABVVlUAVVVVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAFUAAFBVAAAAAAAAAAAAAFBVAFBVVVBVVVVVVVVVVlVVVVVVVVUAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSUiVSUiIlVVVQVVVVVVVVVVVVVVVVVVVlVVVVVVVSIiVVUiIiJVAAAAAFUFAABVVVUAVVVVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAAAAAAAAVQAAAFVVAABVVQYAVVVVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFUAAFBVAAAAAAAAAAAAAABQAABVVQBVVVVVVVVVVlVVVSUiIiIAAABQAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVVVVVVUAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIlVVVVUiVVVVIlJVVSIiVVUiIlJVIiIiVSIiIlUSERFSVVVVJVVVJSJVVSIiVSUiIlUiIiIlIiIRJSIRESISEREiIiJVIiIiIiIiIiIiIiIiIiIiIhEhIiIRESEiERERIlVVVVVVVVVVUlVVVSJVVVUiUlUiIiIlIiIiIiIiIiIiVVZVVVVVVVVVVlVVIiJSVSIiIlIiIiIiIiIiIiIiEhEFAABQVQAAVVVVVSVVVVUiVVUlIlVVIiJSVSIiESUiIlUiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiUlVVVSJSVVUiIlVVIiJSVSIiIlUiIiIiIiISESIiERFVVSIiVSUiIiUiIiIlIiIiIiIiIiIiIiIRIiIiESEiIiIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiEhEiIhERVVVVVVVVVVUiVVVVIlVVVSJSVVUREVVVERERVREREVFWVVVVVVVVIlZVIiJVIiIiJiIiIiUiIiIiIiIiIiIiEVVVVQAiUlUFIiJSVSIiIlIiIiIiIiIiIiIiIiIRISIiAAAAAAAAAAAFAAAiVQAAIlUGICJVVSIiUlYiIlIlIiIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRESIiAAAiIgIAIiIiAiIiIiIiIiIiIiIiIiIiIiIhIiIiACIiIiAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRESEiERERIgIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiVSIiIlIiIiIiIiIiIiIiIhEiIhERIhIRESIRERFWVVVVVVVVVVJVVSVSVVUlEVFVIhERISIREREiERERIVUiIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIhIRIiJSVSIiIlUiIiIiIiIiIiIiIiIiIiIiESEiIhERIiJVVVVVVVVVVVVVVVVVVVVVUlVVVSJVVVUiVVVVIlJVVVVVVlVVVVVVVVVWVVVVIiJVIiIiJSIiIiIiIhEiIhIRAAAAAAUAAFBVBQBVUlVQVSJSVVUiIlUlESFSIhERUiJQVVVWVVVVVVVVVVZVIiJSIiIiIiIiIiIiIiIiIiIiIlVVVVVVVVVVVVVVVVVVVVVSVVVVIlVVVSJSVVUSERFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVJVVVVSVWVVVVVVVVVVZVVVVVJSIiJiIRESIRERESEREREREREVVVVVVVVVVVVVVVVVVVVVUhVVVVEVFVVRERVVUREVFVVVZVVVVVVVVVVlVVVVUlIlUmIiJVIiIRJSIRESUSERFVAAAAVVUAAFVVBQAiVVUAIiJVBREhUlURESFVERERVQAAAAAAAAAAAAAAAAAAACAAAAAiAAAAIgUAICJVACAiAAAAAAAgIiIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEAAAAAAAAAACIAAAAiIgAAIiICACIiAgAiIiIAESEiAAAAAAAAAAAAAAAAAAAAIiIAIiIiICIiIiIiIhEiIhIRAABVVQBQVVVQVVVVUlVVVSJSVVUiIlVVESFSVRERUlVWVVVVVVVVVVZVVSJVVSIiViUiIlUiIiImIiIiJSIiIlVVVVVVVVVVIlJVVSIiUlUiIhERIhERERIRERERERERVVZVVVVVVVVVVlUlVVVVIlFWVSIRUSUiERElIhERISIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEhEiEhERIhEREVVVVSJSVSUiIiUiIiIiIiIiIiIiESIiIhERIiIRESEiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIRESIRERECAAAAIgAAACIiAAAiIgAAIiICICIiIiIiIiIiISIiIgAgIiIAIiIiIiIiIiIiIiIiIiIiIiIiEiIiEhEiIhERIiIiACIiIgIiIiIiIiIiIiIiIiIRESIiERERIhERESEAAAAAAAAAIgIAIiICIiIiIiIiIiIiIiIiIiIiIiIiIgBQVVUiUlVVIiJSVSIiIlIiIiIiIiIiIiIRESESERERVVVVVVVVVVVVVVUlVVVVIlVVVSJVVSUiUlUlIlJVIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiIRIiISESIiIiIiIiIiIiIiIiIiIiISEREiERERERERERERERERVVVVVlJVVSIiVSUiIlIiIiIiIiIiIiIiISIiIhEiIiIiIiJSIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiISIiIiEQAAAAACAAAAIgAAACICAAAiIgAAEhERABERERERERERAAAAAAAAAAAAACIiACIiIiAiIiIiIiIiIiIiIiEiIiIAAAAAAAAAAAIAAAAiAgAAIiIAUCIiAlUiIiJVIhERUQAAVSUAVVUiUFYiIlVVIiJVJiIiVSIiIlUiIiIlIiIiIlVWVSJSVSUiIlIiIiIiIiIiIiIRIiIiEREiIhERISIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIhERIhIREVVVVVYiVVUlIlJVIiIiJSIiIiIiESEiIhERISIREREiIiIiIiIiIhIiIiIRIiIiERERERERERERERERERERERERERFRERERERERERERERERERERERERERERERERERERESIREREiERERERERERERERERERERERERERERERERERERERERIRERESEREREREREREREREREREREREREREREREREiIiIiIiIiIiIiIiIiIiIiERERERERERERERERERERESIiEREiEhERIhERESIRERERERERERERERERERERERERESEiIhERIiIRESEiEREhIhEREREREREREREREREREREiEhERIhERERIRERESERERERERERERERERERERERERERERIiIRESEiERERIhERESIRERERERERERERERERERERIhIRESISEREiERERIhERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERESIiEhEiIhERIRIRESESERERERERERERERERERERERERIiUiIiIlIiIiJSIiIiUiIhERERERERERERERERERERERIiIiESEiIhERIiIRESIiERERERERERERERERERERESIiIhEiIhIRIiIRESIiERERERERERERERERERERERERERERIREREREREREREREREREREREREREREREREREREREiIiIiIiIiIiEiIiIhIiIiERERERERERERERERERERERIRERESERERERERERERERERERERERERERERERERERERIiIRESISEREhERERIRERERERERERERERERERERERERERESEiERERIhERESEREREhERERERERERERERERERERESJSVSYiUlUlIlJVJiJSVSURERERERERERERERERERERVVZVElVVVRJRVlURUVVVERERERERERERERERERERERERERFVERERVREREVERERFRERERERERERERERERERERESIREREiEREREhERERIRERERERERERERERERERERERERERERUREREVERERERERERERERERERERERERERERERERFVACIiVQUiIlVVIiJVVSIiERERERERERERERERERERESIiEhEiIhERIhIRESISEREREREREREREREREREREREREREhVREREVURERFRERERUREREREREREREREREREREREiIiISIiIiEiIiIhEiIiIRERERERERERERERERERERERERESIREREiERERIRERESERERERERERERERERERERERERERIhERESIRERERERERERERERERERERERERERERERESERERERERERERERERERERERERERERERERERERERERESIiIiIiIiISISIiESEiIhERERERERERERERERERERERIVUiIhFVIiIRUSIiEVEiIhEREREREREREREREREREREiIhERIiIRESISEREiEhEREREREREREREREREREREREREhIiIRISIiEREiIhERIiIRERERERERERERERERERERIiISESIiEhEiIhERIiIRERERERERERERERERERERERERIiIiESIiIhEhIhIRISISERERERERERERERERERERESUiIiIhIiIiESIiIhEiIiIRERERERERERERERERERERIiIiIiIiIiIiIiIiIiIiIiUiIiJVVVVVVVVVVVVVVVURERFREhERVSJSVVUiVVVVVVVVVVVVVVVVVVVVVVVVVVURERFVFRERVVUREVVVJRFVVVUlVVVVVVVVVVVVVVVVERERIRERESIRESEiESEiIiIiIlVVVVVVVVVVVVVVVVUiUlUiIlVVVVJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEREiIhIRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEVElIhFVVSJVVVUlVVVVVVVVVVVVVVVVVVVVVVVVVVUiIiIiIiIiIiIiIiIiIiIiVSIiIlVVVVVVVVVVVVVVVSISEREiIhERIiIVESJSVVVSVVVVVVVVVVVVVVVVVVVVEREiIhEhIiIRIiIiVSUiIlVVIiJVVVUiVVVVVVVVVVUiEhERIiIRESIiEhEiIiISIiIiUiIiUlVVVVVVVVVVVRERERERERFRERERVRERVVVVVVVVVVVVVVVVVVVVVVVVJSISEVUiIhFVVSIiVVVVIlVVVVVVVVVVVVVVVVVVVVURESIiESEiUiIiUlUiUlVVVVVVVVVVVVVVVVVVVVVVVVVVJSJVVVUiVVVVIlVVVVVVVVVVVVVVVVVVVVVVVVVVIhIRESIiEREiIiIiIiIiIiUiIiJVJSIiVVVVVVVVVVURIiIiISIiIiIiIgIiIgIAIiIAACIAAAAAAAAABQAAACIiIhEiIiISIiIiIiAiIiIAIiIiAFUiIgBVVSIAVVVVERERIRERESIRESEiIiIiIiIiIiIiIiJSIiJSVVVVVVUiIiIiIiIiIiIiIiIiIiIiUiUiIlVVJSJVVVVVVVVVVRIREREiERERIhIRESIiEREiIiIRIiJVVVVVVVVVVVVVERERERERESERERElERFRVRFRVVVVVVVVVVVVVVVVVVUiIhERIiISESIiIhElIiIiVSIiIlVVIiJVVVVVVVVVVRERISIRESIiESEiIiIiIlUiIlJVIlJVVVVVVVVVVVVVUlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIhERVVUSEVVVVRFVVVVVVVVVVVVVVVVVVVVVVVVVVRERUVUREVVVEVFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIiIiIlUiIlJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVURERFRFRERVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEREREREREREVERERVREREVVVERFVVVVVVVVVVVVVVVURERFVERFRVRERVVURUVVVUVVVVVVVVVVVVVVVVVVVVVURERFVFRERVVUREVVVVRFVVVVVVVVVVVVVVVVVVVVVERERUREREVUREVFVEVFVVVVVVVVVVVVVVVVVVVVVVVVVVVUiVVVVJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEhEiIiIRICIiIgUgIiIFAAAABQAAAAUAAABVAAAAERECVREhUFUiAFBVAABVVQAAVVUAUFVVAFBVVQBQVVVVJSISVVUiIlVVVSJVVVVVVVVVVVVVVVVVVVVVVVVVVREREREREREREhEREVURERFVVRERVVVVVVVVVVVVVVVVERERIhERUSIREVUlEVFVVVFVVVVVVVVVVVVVVVVVVVUiIiIiIiIiIiIiIiIiIiIiJSIiIlUlIiJVVSUiVVVVVRIREREiERERIhIRESIiEhEiIiIiIiIiVSIiVVVVVVVVERERIhERISIRESIiEVUlIlVVVSJVVVVVVVVVVVVVVVUSERERIhERESISEREiIiIiIiIiIiIiIlJVVVVVVVVVVREiUiUhIlVVIiJVVSJVVVVSVVVVVVVVVVVVVVVVVVVVIhIRESIiEREiIhIRBSIiEgUgIiJVACAiVQAAAFUAAAARERERERERIRERESIRESICIiIiACIiAAAAAAAAAAAAACIiIiJSIiIiUlUiIlBVVSJVVVVVVVVVVVVVVVVVVVVVERERERIREREiERFRIlJVVVVVVVVVVVVVVVVVVVVVVVVRVVUiVVVVIlVVVSVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEREiIhIRIiIiESIiIhIlIiIiVSUiIlVVJSJVVVVVERERERERERERERERERERERIRESIiIiJVIiJVVVVVVVURISIiEVIiIiFVJSJSVVUiVVVVVVVVVVVVVVVVVVVVVSIiEhEiIiIRIiIiEiIiIiIiIiJSVVVVVVVVVVVVVVVVEREREREREREREREREhERVVVVVVVVVVVVVVVVVVVVVVURIiIiUSIiIlUAIiJVAFVVVQVVVVUFVVVVVVVVVVVVVRIREREiERFRUlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSUiIlVVIiJVVSIiVVVVIlVVVSVVVVVVVVVVVVVVVVUSERERIhERESISEREiIhIRIiIiIiUiIiJVVVVVVVVVVRERESIRESEiERFSIhFSVSUiVVVVVVVVVVVVVVVVVVVVIhERESISEREiIhERIiIiESUiIiJVVVVVVVVVVVVVVVUREREhERERIhERUSIRUVUlVVVVVVVVVVVVVVVVVVVVVQUAAAAFAAAAVQAAAFUAAABVAAAAVQUAAFUFAABVBQAAUFVVVVBVVVVQVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAVQAAAFUAAABVBQAAVQUAAFUFAABVBQAAVQUAAABVVVUAVVVVAFVVVVBVVVVQVVVVUFVVVVBVVVVQVVVVVQUAAFUFAABVBQAAVVUAAFVVAABVVQAAVVUAAFVVAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVVUFAFBVBQBQVQUAUFVVAFBVVQBQVVUAUFVVAFBVVQBQVQUAAFUFAABVBQAAVQUAAFUFAABVBQAAVQUAAFUFAABVVQUAVVUFAFVVBQBVVQUAVVUFAFVVBQBVVQUAVVUFAFBVVVVQVVVVUFVVVQBVVVUAVVVVAFVVVQBQVVUAUFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVVBVVVVVVQBQVVUAUFVVAFBVVQBQVVUAUFVVAABVVQAAVVUAAFUAAABVAAAAVQAAAFUAAAAFAAAABQAAAAUAAAAFAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVVUFVVVVBVVVVVVQUAVVUFAFVVBQBVVQUAVVUFAFVVAABVVQAAVVUAAAAAVVUAAFVVAABQVQAAUFUAAABVAAAAUAAAAAAAAAAAVVVVBVVVVQVVVVUAVVVVAFVVBQBVVQAAVQUAAFUFAABQVVVVUFVVVVBVVVUAVVVVAFVVVQBVVVUAVVVVAFVVVVUFAABVBQAAVQUAAFUFAABVBQAAVQUAAFUAAABVAAAAVVVVVVVVVVVQVVVVUFVVVVBVVVUAVVVVAFVVVQBVVVVVVVVVVVVVVVVVVQVVVVUFVVVVAFVVVQBVVQUAVVUFAFBVVVVQVVVVAFVVVQBVVVUAVVVVAFBVVQBQVVUAUFVVVVUAAFVVAABVBQAAVQUAAFUFAABVAAAAVQAAAFUAAABQVVVVAFVVVQBQVVUAAFBVAAAAVQAAAFAAAAAAAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVUAUFVVVVVVVVVVVVVVVVVVVVVVAFVVBQBVVQAAVQAAAAAAAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAUFVVAFBVVQAAVVUAAFVVAABVVQAAUFUAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVVQVVAAAABQAAAAUAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAUFVVAABVVQAAVVUAAFBVAABQVQAAAFUAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVVQBVVQAAVQUAAFUAAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAVVUAAFVVAABQVQAAUFUAAABVAAAAVQAAAFAAAABQVVVVVVVVVVVVVVVVVVVVVVVVVQVVVVUFVVVVAFVVVQAFAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVUAAFVVAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVQUAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVQBVBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAAFUAAABQAAAAUAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVUAVVVVAFVVVVVVVQBVVVUAVVUFAFVVBQBVVQAAVQUAAFUAAABVAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVBVVVVQVVVVAFVVVQBQVVUAAFVVAABQVVVVVVVVVVVVVVVVVVVVVVUFUFVVAABQVQAAAFAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUAVVUAAFUAAABVVQUAVVUAAFUAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVQVVVVAFVVVQBVVVUAUFVVAABVVQAAUFUAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVQUAVVUAAFUFAABVBQAAVQAAAAUAAAAAAAAAAAAAAABQVVUAAFVVAABQVQAAAFUAAABQAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVQBVVVVVVVVVVVVVVVVVVQVVVVUAVVUFAFVVAABVBQAAVQAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVUAVVVVAFBVVQAAVVUAAABVAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVBQBVBQAAVVUFAFVVAABVBQAABQAAAAAAAAAAAAAAAAAAAAAAAAAAUFVVAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVAFBVVQAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVUFVVVQBQVVUAAFVVAABQVQAAAFAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAFVVAABVVVUAVVUFAFVVAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAVVUAAFBVAAAAVQAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVQBVVVUAAFVVAAAAUAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVUAVVUAAFUAAAAAAAAAVVVVVVUAAFUFAABQAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVAFVVVQAAVVUAAABVAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVQUAVVVVVVVVVQVVVVUAVVUFAFUFAAAFAAAAAAAAAAAAAAAAVVVVAABVVQAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVVVVVVQBVVVUAAABQAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAAAAAFVVVVVVVVUFVVUAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAFBVVQAAUFUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVUAUFVVAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVVVVVVVVVVVVVVQUAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVQUAVQAAAAAAAAAAAAAAAAAAAAAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVBVVVUAVVVVAFBVVQAAUFUAAABQAAAAAAAAAAAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVQVVVVAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVQUAVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVQUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhBBARnyLMEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACGDAsZHwJfIxQJAAAAAAAAAAAAAAAAAAAAAAAAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACAAIAAgACAAIAAgACAAIAAgAqAAIAHgACAAIAAgACAAIAAgACACIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACoAAgACAAIAIgACAAIAAgACAAIAAgAiAAIAAgAqAAIAAgACAAIAKgACAAIABgAOAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAWAAIAAgACACIAAgACABYAAgAOAAIAAgACAAIAAgACAAIAGgACAAIAAgAaAAIAAgACAAIAAgACAAIAIgACAAIAAgACAAIAAgACAAIAAgAWAAIAAgACAAIAAgACAAIAAgAWAAIAAgACAAIAAgACAAIAAgACABoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgACAAIAJgACABoAAgACAAIAAgACAAIACgACAAIAAgACAAIAJgACAAIAAgACAAIAHgACAAIAHgACACIAAgACAAIAAgAOAAIAKgACAAIAAgACACoAAgAmAAIAAgACAAIAAgACAAIAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgAGAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaACoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgACAAIADgACAAIAAgAeAAIAAgACABYAAgACAAIAAgACACYAAgACAAIAAgACAAIAJgAmAAIAIgACAAIAAgACAB4AAgACAAIAAgACACIAAgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoAAgAmAAIAJgAaAAIAFgACAAIAAgACAAIAEgASABYAKgACAAIAAgAqAAYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACAAoAAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAB4AAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgAaAAIACgACABYAGgAOAAoAAgACAAIAAgACAB4AAgAKAA4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgASAAIAAgAmACoAAgACABIAAgAqAAIAAgAKAAIAAgAGAAIAAgACAAIAAgAGAAIAAgACAAIAJgACAAIAAgACAAIAFgACACIAAgACAAIAAgACABoAAgACAAIAAgAOAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAAgACAAIAAgACABIAAgAaAAIAAgACAAIAAgASAAYAAgACAAIACgACAAIAAgAiAAIAAgACAAIAAgACAAIAAgAWACIAAgAmABoAAgACAAIAEgACAAIAAgAiAAIAAgACACoAAgACABYAAgACAAIAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAJgACAAIAAgACAAIADgAmAAIAAgACAAIAAgACAAIAAgACAAIAIgACAAIAAgACAAIAAgACAB4AAgACAAIAAgACABYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAGgAiAAIAAgACAA4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABIAAgACAAIAEgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACoAAgACAA4AAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIADgACACYAAgACAAIACgACABIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAiAB4AHgACAB4AKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAIgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgAmAAIAAgACABYAAgACAAIAAgACAAYAAgACAAYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACACoAAgACABIAFgACAAoAAgACAAIAAgACAA4AEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFgACAAIAAgACAAIAAgACABYAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAJgACAAIAAgACAAIAAgACAAIAFgACABIAAgAiAAIAAgACAAIAAgACAAIAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAuQAJALkAuQDJANkA6QD5AOkBCQEZAMkA2QAJAAkAuQC5ASkAuQAJATkBSQE5AOkACQAJAOkBWQEZAAkACQDJAOkACQDpAXkBiQGZAAkACQAJAAkACQGpAZkACQAJAbkBeQHJAXkACQAJAAkACQAJAAkACQAJAAkACQAJAAkBiQAJAAkACQAJAAkACQHpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQH5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkCGQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQJZAmkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQKpAAkACQAJAAkCuQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQLpAAkACQAJAAkACQAJAAkACQAJApkACQAJAvkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkDCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAokACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQMJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJA0kDWQNpAAkACQAJAAkACQAJAAkACQAJAAkDSQNpA3kDiQOJA4kDeQOJA4kDiQAJAAkACQAJA5kDqQOpA6kDqQO5A8kD2QOZA6kDqQOpA6kD6QP5A/kD+QQJBBkEKQQ5BEkEWQRpBDkESQRZBGkACQAJAAkACQS5BMkE2QTpBPkFCQUZBSkEuQU5BUkFWQT5BWkFeQWJBZkFqQW5BckF2QXpBfkGCQXZBekGGQYJBnkGiQaZBqkGuQbJBtkFOQbpBvkHCQcZBrkGyQbZBTkG6QcpBVkHOQbJB0kHWQdpB3kHiQeZB6kHeQeJB5kHqQAJAAkACQgZAAkACQAJAAkIKQAJAAkIOQAJAAkACQAJCCkACQAJAAkACQAJAAkISQAJAAkACQgZAAkACQAJCBkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQDZAAkACQDpAAkACQFpAAkACQC5ASkAuQAJAAkAuQEpALkAuQEpALkBOQAJAAkBCQEZAAkACQDJANkACQDJANkBmQAJAAkACQAJAAkACQAJAAkA6QD5AOkACQAJAXkByQF5AdkByQF5AAkACQAJAAkACQAJAAkBqQGZAAkBiQGZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAgkACQAJAAkB6QAJAAkACQAJAAkACQIpAAkCOQAJAAkACQAJAAkACQIZAAkACQAJAAkACQAJAAkCSQAJAAkACQAJAAkACQAJAAkACQAJAAkACQJ5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkCiQAJAAkACQAJAAkACQAJAAkACQAJAAkCmQAJAAkACQAJAAkACQAJAskACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQLZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAekACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAxkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQH5AAkACQAJAAkACQAJAAkACQAJAAkDKQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAgkACQAJAAkACQAJAAkACQAJAAkACQM5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkDeQOJA4kDiQAJAAkDeQOJA4kDiQAJAAkACQAJAAkACQN5A4kDiQAJAAkACQAJAAkACQAJAAkACQAJA5kDqQOpBDkESQRZBGkACQAJBDkESQRZBGkDmQOpA6kDqQR5BIkEmQPJA9kEeQSpBIkEeQSpBKkEqQSJAAkACQUJBikFKQXZBekGGQYJAAkACQY5BkkGGQYJBlkGaQYZBgkFuQXJBQkFGQUpBQkFGQUpBLkFOQVJBVkE+QAJAAkG+QcJB7kHeQeJB5kHqQfJB9kHeQeJB5kHqQd5B4kHmQepB+kHaQb5BwkHGQb5BwkHGQa5BskG2QU5BukH+QgJAAkACQg5AAkACQAJCBkACQhJAAkACQAJCBkACQAJAAkIGQAJCEkACQAJCDkACQAJCDkACQAJAAkACQgpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAABATAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEwAAAAEAACIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiIhIiIiISIiIiEiIiIhIiIiISIiIiEiIiIhIhIiIiISIiIiEiIiIhIiIiISIiIiEiIiIhIiIiISIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIjMzMzMAAAAAIhIhIiISISIiEiEiIhIhIiISISIiEiEiMxMxMwAAAAAiIiISIiIiEiIiIhIiIiISMzMzEwAAAAAAAAAAAAAAACEiIiIhIiIiISIiIiEiIiIxMzMzAAAAAAAAAAAAAAAAIhIhIiISISIiEiEiIhIhIiISISIiEiEiIhIhIiISISIiIiIiIiIiIiIiIiIiIiIiMzMzMwAAAAAAAAAAAAAAACISISIiEiEiIhIhIiISISIzEzEzAAAAAAAAAAAAAAAAIiIiEiIiIhIiVSISIlUiEjMzMxMAAAAAAAAAAAAAAAAiIiIiIiIiIiJVIiIiVSIiMzMzMwAAAAAAAAAAAAAAACIiIiIiIiIiMzMzMwAAAAAAAAAAAAAAAAAAAAAAAAAAIlUiEiJVIhIzMzMTAAAAAAAAAAAAAAAAAAAAAAAAAAAhIiIiISIiIjEzMzMAAAAAAAAAAAAAAAAAAAAAAAAAACIiIhIiIiISMzMzEwAAAAAAAAAAAAAAAAAAAAAAAAAAIiIiIiIiIiIiIiIiIiIiIiJVIiIiVSIiMzMzMwAAAAAiEiEiIhIhIjMTMTMAAAAAAAAAAAAAAAAAAAAAAAAAACJVIiIiVSIiMzMzMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABEBEQzRDREIyIiIgAAAAAAAAAAAEAAQABAAEAAQABABEQERDRENEQiIiIiAAAAAAAAAAAAQAAAAEAAAABAAAAERAQANEQ0MyIiIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzMzMzIyIiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMzMzMiIiIiAAAAAAAAAAAAAAAAAAAAADMzMzMjIiIiIyIiIiMiIiIAAAAAAAAAAAAAAAAAAAAAMzMzMyIiIiIiIiIiIiIiIiMiIiIjIiIiIxEhIiMiEhEjUlUiI1JVIiMiIiIjIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIRIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhEiIiIiIgAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQABAAEAARAREAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQAREBEQAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAAAQAAABEQEACMiIiIjIiIiIxEiIiMiESEjIiISIyIiIiMiIiIjIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiISESIiIiIRIiIiIiIjIiIiIyIiIiMRESIjIiIRIyIiIiMiIiIjIiIiIyIiIiIiIiIiIiIiIiIiIhERISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIiIiEREiIiIiIgBAAEAAQABAAEAAQABEBEQzRDREIyIiIiMiIiIjIiIiAEAAAABAAAAAQAAABEQEADRENDMiIiIiIiIiIiIiIiIjIiIiIyIiIiMRISIjIhIRIyIiIiMiIiIjIiIiIyIiIgBAAEAAQABAAEAAQAREBEQ0RDREIiIiIiIiIiIiIiIiIxERISMiIhIjIiIiIyIiIiMiIiIjIiIiIxERISMiIhIiIiIiERERESIiIiIiIiJSIiIiUiIiIiIiIiIiERERESIiIiIiIiIiEREREVUiIiJVIiIiIiIiIiIiIiIiIiIiIiIiIlJVIiJSVSIiERERESIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiEhERIiIiIiIiIiIiIiIiIiMRISIjIhIRIyIiIiMiIiIjIiIiIyIiIiMRISIjIhIRIiIiIhEiIiIiEREiIiIiESIiIiIiIiIiIiIiIhEiIiIiIiIiIiIiIiIiIiIRISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIjNENEQjIiIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiNEQ0RCIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiI0RDREIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIjRENEQiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERNEQ0MyIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiIjESIiIyIRISMiIhIjIiIiIyIiIiMiIiIjESIiIyIRISIiIiIiIiIiISIiIhIRIiIiIhEiIiIiIiIiIiIiIiIiIxERIiMiIhEjIiIiIyIiIiMiIiIjIiIiIxERIiMiIhEiIiIiEREhIiIiEhEiIiIiIiIiIiIiIiIiIiIiEREhIiIiIiIiIiIiESFSVSISUVUiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIiIiJVJSIiVRURIiIiIhEiIiIiIiIiIiIiIiIRIiIiIxERIiMiIhEjIiIiIyIiIiMiIlUjIiJVIxERIiMiIhEiIiIiEREhIiIiEhEiIiIiJSIiIiUiIiIiIiIiEREhIiMREVIjIiJRIyIiIiMiIiIjIiIiIyIiIiMRESIjIiIRVSIiIlURISIiIhIRUlUiIlJVIiIiIiIiIiIiIhERISIzMzMzIyIiIiMiIiIjIiIiIxERIiMiIhEjIiIiIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiEREhIiIiEhEiIiIiMzMzMyIiIiIiIiIiIiIiIiIiIiIiIiIiESEiIiISEREzMzMzIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiESIiIiMiIiIjIiIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIhIiIiIyIiIiMiIiIjIiIiIyIiIiMRISIjIhIRIyIiIiMiIiIiEREiIiIiESIiIiIiIiIiIiIiIhEiIiIiEREiIiIiESIiIiIRISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIRISIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiIyIiIiMiIiIiIiIiIiIiIiIiIiIiIiIiERERESIiIiIiIiIiIiIiIhIRESIiIiIiIiIiIiIiIiIiIiIiISIiIhIRESIiIiIiIyIiEiMiIiIjIiIiIyIiIiMRUlUjIlFVIyIiEiMiIiIhIiIiEhEiIiIiESIiIiIiIiIiIiIiIiIhIiIiEhEiIiMiIiIjIiIiIyIiIiMiIiIjEREiIyIiESMiIiIjIiIiIiISESIiIiIiIiIiIiIiIiIiIiIRESEiIiISESIiIiIRISIiIhIRESIiIiIiIiIiIiIiIiIiIiIRISIiIhIRESIiIiIRIiIiIhERIiIiIiIiIiIiIiIiIiIiIiIRIiIiIiIiIlFVIiJSVREiIiIiIiIiIiIiIiIiIiIiIhEhIiIzMzMzIyIiIiMiIiIjIiIiI1FVIiNSVSEjIiISIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiISESIiIyIiEiMiIiIjIiIiIyIiIiMRIiIjIhEhIyIiEiMiIiIzMzMzIyIiIiMiIiIjIiIiIxEhIiMiEhEjIiIiIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIRABERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABRdv9/31NfewAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/39fd99b/3/UZ39mAAAAAAAAAAAAAAAAAAAAAAAAAIAAgACAAIAGgACAAIAAgACAAIADgACABIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgACAAIAAgAiAAIAEgACAAoAAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA4AAgACAAIAAgACAAIAFgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAEgACAAIAKgACAAIAGgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgAmAAIAAgAmAAIAAgACAAIADgACAAIACgASAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoAAgACAAIAAgACAAIAAgACAAoAAgACAAIAAgAiAAIAAgASAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACAAIAAgACAA4AAgACAAIAAgACABIAAgACAAIAAgACAAIAAgACAAIAJgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAoAAgACAAIAAgACAAIAAgACAAIAAgACAAYAJgACAAIAAgAiAAIAAgAGAAIAAgACAAIAAgACAAIAAgACAAIAGgAKAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAJgACAAoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACACIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAoAGgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAWAAIAHgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACACIAAgACAAIAAgAWAAIAAgACAAIAAgACAAIAAgASAAIAAgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAOAAIAAgACAAIAAgAKAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgASAAIAAgACAAIABgACAAIAAgACABIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgAaAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACACIAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACAAIAAgACAAIAAgAqAAIAGgACAAIAHgAqAAIABgACAAIAAgAaAAIAAgACAAIAAgACAAIAAgACAA4AJgACABYAAgACACIABgACAB4AAgACACoAJgACAAIAAgACACoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACAAIAAgACAA4AAgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgAeAAIAAgACAAIACgACAAIAAgAiAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACAAIAAgASACoAAgAGAAIAAgACACYAAgACAAIAAgACAB4AAgAOAAIAAgACAAIAAgACAAIAAgACACoAAgACAAIAJgACAAIADgACAAIAEgACAAIAAgAeAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACAAIAAgAGABYABgACAAIABgACAAoAAgACAAIAAgAeAAIAEgACAAIAAgAOAAIAAgACABYAAgACAAIAAgAmAAIAAgACAAIAAgACAAIAHgACAAIAAgACAAIAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgACABYAAgAKAAIAGgACAAIAAgACAAIAAgACAAIAAgAWAAIAGgACAAYAAgACABYAAgACAAIAJgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAIACgACAAIAHgACAAIAAgAmAAIAAgACABIAKgACAAIAAgAaAAIAAgACAAYAHgACAAoAAgACAAIAAgACAAIAHgACAAIAEgACAAYAFgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAOAAIAAgACAAIAAgASAAIAAgACAAIAKgACAAIAGgACAAIAAgAaAAIAAgAmABoAAgACAAIAAgACAAIAAgAGAAIAAgAiAAIAAgACAB4AHgACAAIAAgAeAAIAAgACAAIAAgACAAIAAgAOAAIAAgACACYAJgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgACAAIAAgACAAIAAgAqABYABgASAAIAAgACAA4AAgACAAoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACAAIAAgAmAAYAAgASABYAAgACACoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoAAgAGAAIAAgACACYAAgACAAIAAgACAAIAFgACABoAAgACAAIAAgACAAIAAgACACoACgACAAIAAgAaAAIAAgACAAIAAgACAA4AAgACAAIAAgACAB4AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAuQDJANkA6QD5AQkACQAJAAkBGQEpATkACQFJAVkBaQAJAAkA6QD5AQkACQF5AYkBmQAJAAkBqQG5AAkACQAJAtkC6QAJAAkC+QAJAAkACQAJAwkDGQAJAAkACQMpAAkACQAJAAkC+QAJAAkACQM5AAkACQAJA0kDWQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJA+kACQP5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBBkACQAJAAkACQAJAAkACQAJBCkACQAJAAkACQAJBAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQRJAAkACQAJAAkACQRZAAkEaQAJAAkACQAJAAkACQAJAAkACQQ5AAkACQAJAAkACQAJAAkACQQZAAkACQAJAAkACQAJAAkACQAJAAkACQR5AAkACQAJAAkACQAJAAkACQAJBIkEqQS5AAkACQAJAAkACQAJAAkACQAJAAkACQTJAAkACQAJAAkACQTZAAkACQAJAAkACQAJAAkACQAJAAkACQTpAAkACQAJAAkACQUJAAkACQUZAAkACQAJAAkFKQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQA5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFWQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBWkFeQAJAAkACQAJAAkFiQAJAAkACQWZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQW5AAkACQAJAAkACQAJAAkACQXJBdkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQX5AAkACQAJAAkACQAJAAkGCQAJAAkACQYZAAkACQAJAAkACQAJAAkACQAJBikACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQZJBlkGaQZ5BokGmQAJBqkGuQbJBtkG6Qb5BwkACQcZBykHOQdJB1kHaQd5B4kHmQepB7kACQfJB9kH6Qf5CAkJeQmJCZkJqQm5CckJ2QnpCfkKCQoZCikKOQpJClkKaQp5CokKmQqpCrkKyQrZCukK+QsJCxkLKQs5C0kLWQtpDVkNaQ15DYkNmQ2pDbkNmQ3JDdkN6Q35DgkN2Q4ZDckOKQ45DkkOWQ5pDfkOeQ6JDpkNqQ6JDVkNaQ6pDfkOuQ/JD9kP6Q/5AAkQGRApEDkQSRBZEGkQeRCJEJkQqRC5EMkQ2RDpEPkRCREZESkRORFJEVkRaRF5EYkRmRGpEbkWaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQOpE7kWaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkECRZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBFkWaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQTJFNkWaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBWkVeRWJFmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZJEAkGWRZpFmkGaQZpBmkGaQZpBmkFmRZ5E/kWaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBvkXCRAJAAkHGRcpFmkGaQZpBmkGaQc5F0kQCQdZF2kXeReJFSkWaQZpBmkGaQf5GAkYGRZpBmkGaQZpCCkYORcJEAkACQAJAAkACQhJGFkYaRh5GIkXCRAJAAkACQAJAAkACQkJGRkXeRkpGTkQCQAJAAkJSRX5F3kZWRjZEAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQHJAdkACQAJAekB+QIJAAkACQIZAikCOQAJAkkCWQJpAAkACQJ5AokACQAJAAkCmQKpAAkACQAJArkCyQAJAAkACQAJAAkACQAJA2kDeQAJAAkACQOJA5kACQMJA6kDuQAJAAkDyQPZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkECQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBDkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBJkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkEeQAJBPkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBTkFSQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFiQAJAAkACQAJAAkACQAJAAkACQAJAAkE2QAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBakACQAJAAkACQAJAAkACQAJAAkACQXpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBjkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQYJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJCBkIKQAJAAkACQAJCDkISQhZBmkIaQh5CIkImQAJCKkIuQAJCMkI2QjpCPkJCQkZAAkACQAJCSkJOQlJCVkJaQt5C4kLmQupC7kLyQvZC+kL+QwJCXkMGQwpDDkMSQxZDGkMeQyJDJkMqQy5DMkM2QzpDPkNCQ0ZDBkNKQ05DUkOyQ7ZDukO+Q3ZDakPCQ8ZDfkPKQ2ZDmkPOQ9JDikN6Q35D1kN+Q9pD3kN+Q+JD5kN+Q+pD0kPuQ5pDykOyQ2JAckR2RHpEfkSCRFZEWkSGRIpEjkSSRJZEmkSeRKJEpkSqRK5EskS2RLpEvkTCRMZEykTORNJE1kTaRN5E4kTmRZpBmkGaQPJE9kWaQZpBmkGaQZpBmkGaQZpBmkGaQPpEAkD+RZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkGaQZpBmkEGRZpBmkGaQZpBmkGaQZpBmkGaQZpBmkEKRAJBDkWaQZpBmkGaQZpBmkGaQRJFmkGaQZpBmkGaQZpBmkGaQZpBGkUeRZpBmkGaQZpBmkGaQZpBmkGaQZpBIkQCQSZFmkGaQZpBmkGaQZpBKkUuRZpBmkGaQZpBmkGaQZpBmkE6RAJBPkWaQZpBmkGaQZpBmkGaQZpBmkGaQUJEAkACQUZFSkWaQZpBmkFORVJFVkWaQZpBmkGaQZpBmkGaQWZFakQCQW5FmkGaQZpBmkGaQZpBmkGaQZpBckV2RAJAAkACQXpFfkWCRYZEAkACQYpFjkWaQZpBmkGaQZpBokWmRAJAAkACQapFmkGaQZpBmkGaQZpBmkGuRbJEAkACQAJAAkACQAJAAkACQAJAAkACQbZFukWaQZpBmkGaQAJAAkACQAJAAkGWReZE/kWaQZpBmkGaQepF7kQCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQfJF9kX6RZpBmkACQAJAAkACQAJAAkACQiZGKkYaRi5GMkY2RAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBlkY6Rj5EAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAMQAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAEBMAACASEREgEhERICIRESAiEREgIhERACISEQAiIhEAICIiEREREREREREREREhERERIRERESEREREiEREhIhEhIiIiAAAAIgAAACIAAAAiAAAAIgAAAAIAAAACAAAAAAAAAAAAACAAAAAgAAAAIAAAACAAAAAAAAAAAAAAAAAAAAAAEhERERIREREiERERIhERESISEREiIhEhICIiIgAiIiIRIgAAESIAACEiAAAhIgAAIgIAACICAAAiAAAAAgAAAAAAIhEAACIRAAAiEgAAIhIAACAiAAAgIgAAACIAAAAiERERERERERERERERERERERERESESEREiIhEhIiIiIiIhAgAAIQIAACICAAAiAgAAIgAAACIAAAACAAAAAgAAAAAAIhEAACIRAAAiEgAAIhIAACAiAAAgIgAAACIAAAAgERERIRERESEREREiERERIhERISISESIiIiIiAiIiIgACAAAAAgAAAAIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAiAAAAIgAAACIAAAAgAAAAIAAAAAAAAAAAERERERERERESEREREhERESIRESEiEhEiIiIiIiAiIiIhAgAAIQIAACICAAAiAgAAIgAAACIAAAACAAAAAAAAACASEREgEhERICIRESAiEREAIhIRACIiEQAgIiIAACIiEREiABERIgARISIAESEiABEiAgAhIgIAIiIAACICAAAAAAAiAAAAIgAAACIAAAAgAAAAIAAAAAAAAAAAAAAAABERIQISESICEhEiAiIhIgAiIiIAIiICACAiAAAAAAAAAAAAIAAAACAAAAAgAAAAIAAAACAAAAAAAAAAAAAAAAASEREREhERESIREREiERERIhERESISEREiIhERICIiERERESIREREiEREhIhERISIRESEiEREiAhEhIgIhIiIAAAAAIgAAACIAAAAiAAAAIgAAACIAAAAgAAAAIAAAAAARERERERERERIRERESEREREhERESIREREiEhERIiISERERIQIRESECEREiAhERIgIRESICESEiABEiIgAiIgIAAAAiEQAAIhEAACISAAAiEgAAIhIAACAiAAAgIgAAACIRERERERERERERERERERERERERERERERESERERIhIRIhEhAgARIQIAESICABEiAgARIgIAISIAACIiAAAiAgAAACIREQAiEREAIhIRACISEQAgIhEAICISAAAiIgAAICIRESECEREhAhERIgIRESICESEiABEiIgAiIgIAIiIAAAAAIBIAACAiAAAgIgAAACIAAAAiAAAAIAAAAAAAAAAAEREiABEhIgARISIAEiICACIiAgAiIgAAIgIAAAAAAAAAIBIRACASEQAgIhEAICIRAAAiEgAAIiIAACAiAAAAIBERIgARESIAESEiABEhIgARIgIAIiICACIiAAAiAAAAAAAiIgAAICIAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAiIiICIiIiACIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIiIiICIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiIgAgIiIAACAiAAAAAAAAAAAAAAAAAAAAAAAAAAAiIgIAIiIAACIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAiIiIAIiIiAAAiIgAAAAAAAAAAAAAAAAAAAAAAAAAAIiIAACICAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIiIiIiIiIgAiIgIAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAABAQwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAEBDAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAEMAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAEBDAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEMAAAAEAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEMAAAAEAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAEMAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAABAAAAANAQAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAFVVAFVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAAFBQVVVVVVVVVVVVVVVVVVZVVVVVVVVVVlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVQAAAABVAAAAVVUFAFVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAFUAAABVVQAAVVVVAFVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAVQAAVVUAVVVVVVVVVQAAAAAAAABVAFBVVVVVVVVVVlVVVVVVVVVWVVVVVVVVAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSJVVVVVVVVVVVVVVVVVVVVVVVVWVVVVVVVVVVZVIiJSVQUAAABVVVUFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAABVAAAAVVUFAFVVVQZVVVVVVVVVVlVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAABVBQAAVVUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAAAiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACIiAgAiIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAJSIAAAAAAAAAAAAAAFAAAFVVAFVVVVVVVVVVVVVVIiJVVQAAAFAAVVVVVVVVVVVVVVVVVVVWVVVVVVVVVVZVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIiJVVQAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIlJVVQAAAAAFAAAAVVUAAFVVVQVWVVVVVVVVVVZVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAAUAAABVBQAAVVUFAFVVVQUAAAAAAAAAAAAAAAAAAAAAAAAAUAAAUFUAUFVVAFVVVQAAAAAAAABQAFBVVVBVVVVVVVZVVVVVVVVVVlVVVVVVAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVQAAAABVVQAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAVQAAAFVVAABVVVUAVVVVVVVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAFBVAAAAAAAAAAAAAAAAAABQVQBQVVZQVVVVVVVVVlVVVVUAAAAAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBQBVVVVVVVVVVVVVVVVWVVVVVVVVVVZVJSJVJSIiAAAAAFUAAABVVQUAVVVVVVVVVVVVVVVVIiJVVSIiIlUAAAAAAAAAAAAAAAAAAAAAVQAAAFVVAABVVlUAVVVVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiIiICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAFUAAFBVAAAAAAAAAAAAAFBVAFBVVVBVVVVVVVVVVlVVVVVVVVUAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSUiVSUiIlVVVQVVVVVVVVVVVVVVVVVVVlVVVVVVVSIiVVUiIiJVAAAAAFUFAABVVVUAVVVVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAAAAAAAAVQAAAFVVAABVVQYAVVVVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFUAAFBVAAAAAAAAAAAAAABQAABVVQBVVVVVVVVVVlVVVSUiIiIAAABQAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlVVVVVVVVVWVVVVVVVVVVUAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIlVVVVUiVVVVIlJVVSIiVVUiIlJVIiIiVSIiIlUSERFSVVVVJVVVJSJVVSIiVSUiIlUiIiIlIiIRJSIRESISEREiIiJVIiIiIiIiIiIiIiIiIiIiIhEhIiIRESEiERERIlVVVVVVVVVVUlVVVSJVVVUiUlUiIiIlIiIiIiIiIiIiVVZVVVVVVVVVVlVVIiJSVSIiIlIiIiIiIiIiIiIiEhEFAABQVQAAVVVVVSVVVVUiVVUlIlVVIiJSVSIiESUiIlUiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiUlVVVSJSVVUiIlVVIiJSVSIiIlUiIiIiIiISESIiERFVVSIiVSUiIiUiIiIlIiIiIiIiIiIiIiIRIiIiESEiIiIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiEhEiIhERVVVVVVVVVVUiVVVVIlVVVSJSVVUREVVVERERVREREVFWVVVVVVVVIlZVIiJVIiIiJiIiIiUiIiIiIiIiIiIiEVVVVQAiUlUFIiJSVSIiIlIiIiIiIiIiIiIiIiIRISIiAAAAAAAAAAAFAAAiVQAAIlUGICJVVSIiUlYiIlIlIiIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRESIiAAAiIgIAIiIiAiIiIiIiIiIiIiIiIiIiIiIhIiIiACIiIiAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRESEiERERIgIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiVSIiIlIiIiIiIiIiIiIiIhEiIhERIhIRESIRERFWVVVVVVVVVVJVVSVSVVUlEVFVIhERISIREREiERERIVUiIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIhIRIiJSVSIiIlUiIiIiIiIiIiIiIiIiIiIiESEiIhERIiJVVVVVVVVVVVVVVVVVVVVVUlVVVSJVVVUiVVVVIlJVVVVVVlVVVVVVVVVWVVVVIiJVIiIiJSIiIiIiIhEiIhIRAAAAAAUAAFBVBQBVUlVQVSJSVVUiIlUlESFSIhERUiJQVVVWVVVVVVVVVVZVIiJSIiIiIiIiIiIiIiIiIiIiIlVVVVVVVVVVVVVVVVVVVVVSVVVVIlVVVSJSVVUSERFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVJVVVVSVWVVVVVVVVVVZVVVVVJSIiJiIRESIRERESEREREREREVVVVVVVVVVVVVVVVVVVVVUhVVVVEVFVVRERVVUREVFVVVZVVVVVVVVVVlVVVVUlIlUmIiJVIiIRJSIRESUSERFVAAAAVVUAAFVVBQAiVVUAIiJVBREhUlURESFVERERVQAAAAAAAAAAAAAAAAAAACAAAAAiAAAAIgUAICJVACAiAAAAAAAgIiIgIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEAAAAAAAAAACIAAAAiIgAAIiICACIiAgAiIiIAESEiAAAAAAAAAAAAAAAAAAAAIiIAIiIiICIiIiIiIhEiIhIRAABVVQBQVVVQVVVVUlVVVSJSVVUiIlVVESFSVRERUlVWVVVVVVVVVVZVVSJVVSIiViUiIlUiIiImIiIiJSIiIlVVVVVVVVVVIlJVVSIiUlUiIhERIhERERIRERERERERVVZVVVVVVVVVVlUlVVVVIlFWVSIRUSUiERElIhERISIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEhEiEhERIhEREVVVVSJSVSUiIiUiIiIiIiIiIiIiESIiIhERIiIRESEiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIRESIRERECAAAAIgAAACIiAAAiIgAAIiICICIiIiIiIiIiISIiIgAgIiIAIiIiIiIiIiIiIiIiIiIiIiIiEiIiEhEiIhERIiIiACIiIgIiIiIiIiIiIiIiIiIRESIiERERIhERESEAAAAAAAAAIgIAIiICIiIiIiIiIiIiIiIiIiIiIiIiIgBQVVUiUlVVIiJSVSIiIlIiIiIiIiIiIiIRESESERERVVVVVVVVVVVVVVUlVVVVIlVVVSJVVSUiUlUlIlJVIiIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiIRIiISESIiIiIiIiIiIiIiIiIiIiISEREiERERERERERERERERVVVVVlJVVSIiVSUiIlIiIiIiIiIiIiIiISIiIhEiIiIiIiJSIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiISIiIiEQAAAAACAAAAIgAAACICAAAiIgAAEhERABERERERERERAAAAAAAAAAAAACIiACIiIiAiIiIiIiIiIiIiIiEiIiIAAAAAAAAAAAIAAAAiAgAAIiIAUCIiAlUiIiJVIhERUQAAVSUAVVUiUFYiIlVVIiJVJiIiVSIiIlUiIiIlIiIiIlVWVSJSVSUiIlIiIiIiIiIiIiIRIiIiEREiIhERISIlIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIhERIhIREVVVVVYiVVUlIlJVIiIiJSIiIiIiESEiIhERISIREREiIiIiIiIiIhIiIiIRIiIiERERERERERERERERERERERERERFRERERERERERERERERERERERERERERERERERERESIREREiERERERERERERERERERERERERERERERERERERERERIRERESEREREREREREREREREREREREREREREREREiIiIiIiIiIiIiIiIiIiIiERERERERERERERERERERESIiEREiEhERIhERESIRERERERERERERERERERERERERESEiIhERIiIRESEiEREhIhEREREREREREREREREREREiEhERIhERERIRERESERERERERERERERERERERERERERERIiIRESEiERERIhERESIRERERERERERERERERERERIhIRESISEREiERERIhERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERESIiEhEiIhERIRIRESESERERERERERERERERERERERERIiUiIiIlIiIiJSIiIiUiIhERERERERERERERERERERERIiIiESEiIhERIiIRESIiERERERERERERERERERERESIiIhEiIhIRIiIRESIiERERERERERERERERERERERERERERIREREREREREREREREREREREREREREREREREREREiIiIiIiIiIiEiIiIhIiIiERERERERERERERERERERERIRERESERERERERERERERERERERERERERERERERERERIiIRESISEREhERERIRERERERERERERERERERERERERERESEiERERIhERESEREREhERERERERERERERERERERESJSVSYiUlUlIlJVJiJSVSURERERERERERERERERERERVVZVElVVVRJRVlURUVVVERERERERERERERERERERERERERFVERERVREREVERERFRERERERERERERERERERERESIREREiEREREhERERIRERERERERERERERERERERERERERERUREREVERERERERERERERERERERERERERERERERFVACIiVQUiIlVVIiJVVSIiERERERERERERERERERERESIiEhEiIhERIhIRESISEREREREREREREREREREREREREREhVREREVURERFRERERUREREREREREREREREREREREiIiISIiIiEiIiIhEiIiIRERERERERERERERERERERERERESIREREiERERIRERESERERERERERERERERERERERERERIhERESIRERERERERERERERERERERERERERERERESERERERERERERERERERERERERERERERERERERERERESIiIiIiIiISISIiESEiIhERERERERERERERERERERERIVUiIhFVIiIRUSIiEVEiIhEREREREREREREREREREREiIhERIiIRESISEREiEhEREREREREREREREREREREREREhIiIRISIiEREiIhERIiIRERERERERERERERERERERIiISESIiEhEiIhERIiIRERERERERERERERERERERERERIiIiESIiIhEhIhIRISISERERERERERERERERERERESUiIiIhIiIiESIiIhEiIiIRERERERERERERERERERERIiIiIiIiIiIiIiIiIiIiIiUiIiJVVVVVVVVVVVVVVVURERFREhERVSJSVVUiVVVVVVVVVVVVVVVVVVVVVVVVVVURERFVFRERVVUREVVVJRFVVVUlVVVVVVVVVVVVVVVVERERIRERESIRESEiESEiIiIiIlVVVVVVVVVVVVVVVVUiUlUiIlVVVVJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEREiIhIRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEVElIhFVVSJVVVUlVVVVVVVVVVVVVVVVVVVVVVVVVVUiIiIiIiIiIiIiIiIiIiIiVSIiIlVVVVVVVVVVVVVVVSISEREiIhERIiIVESJSVVVSVVVVVVVVVVVVVVVVVVVVEREiIhEhIiIRIiIiVSUiIlVVIiJVVVUiVVVVVVVVVVUiEhERIiIRESIiEhEiIiISIiIiUiIiUlVVVVVVVVVVVRERERERERFRERERVRERVVVVVVVVVVVVVVVVVVVVVVVVJSISEVUiIhFVVSIiVVVVIlVVVVVVVVVVVVVVVVVVVVURESIiESEiUiIiUlUiUlVVVVVVVVVVVVVVVVVVVVVVVVVVJSJVVVUiVVVVIlVVVVVVVVVVVVVVVVVVVVVVVVVVIhIRESIiEREiIiIiIiIiIiUiIiJVJSIiVVVVVVVVVVURIiIiISIiIiIiIgIiIgIAIiIAACIAAAAAAAAABQAAACIiIhEiIiISIiIiIiAiIiIAIiIiAFUiIgBVVSIAVVVVERERIRERESIRESEiIiIiIiIiIiIiIiJSIiJSVVVVVVUiIiIiIiIiIiIiIiIiIiIiUiUiIlVVJSJVVVVVVVVVVRIREREiERERIhIRESIiEREiIiIRIiJVVVVVVVVVVVVVERERERERESERERElERFRVRFRVVVVVVVVVVVVVVVVVVUiIhERIiISESIiIhElIiIiVSIiIlVVIiJVVVVVVVVVVRERISIRESIiESEiIiIiIlUiIlJVIlJVVVVVVVVVVVVVUlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIhERVVUSEVVVVRFVVVVVVVVVVVVVVVVVVVVVVVVVVRERUVUREVVVEVFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVIiIiIlUiIlJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVURERFRFRERVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEREREREREREVERERVREREVVVERFVVVVVVVVVVVVVVVURERFVERFRVRERVVURUVVVUVVVVVVVVVVVVVVVVVVVVVURERFVFRERVVUREVVVVRFVVVVVVVVVVVVVVVVVVVVVERERUREREVUREVFVEVFVVVVVVVVVVVVVVVVVVVVVVVVVVVUiVVVVJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEhEiIiIRICIiIgUgIiIFAAAABQAAAAUAAABVAAAAERECVREhUFUiAFBVAABVVQAAVVUAUFVVAFBVVQBQVVVVJSISVVUiIlVVVSJVVVVVVVVVVVVVVVVVVVVVVVVVVREREREREREREhEREVURERFVVRERVVVVVVVVVVVVVVVVERERIhERUSIREVUlEVFVVVFVVVVVVVVVVVVVVVVVVVUiIiIiIiIiIiIiIiIiIiIiJSIiIlUlIiJVVSUiVVVVVRIREREiERERIhIRESIiEhEiIiIiIiIiVSIiVVVVVVVVERERIhERISIRESIiEVUlIlVVVSJVVVVVVVVVVVVVVVUSERERIhERESISEREiIiIiIiIiIiIiIlJVVVVVVVVVVREiUiUhIlVVIiJVVSJVVVVSVVVVVVVVVVVVVVVVVVVVIhIRESIiEREiIhIRBSIiEgUgIiJVACAiVQAAAFUAAAARERERERERIRERESIRESICIiIiACIiAAAAAAAAAAAAACIiIiJSIiIiUlUiIlBVVSJVVVVVVVVVVVVVVVVVVVVVERERERIREREiERFRIlJVVVVVVVVVVVVVVVVVVVVVVVVRVVUiVVVVIlVVVSVVVVVVVVVVVVVVVVVVVVVVVVVVVSIiEREiIhIRIiIiESIiIhIlIiIiVSUiIlVVJSJVVVVVERERERERERERERERERERERIRESIiIiJVIiJVVVVVVVURISIiEVIiIiFVJSJSVVUiVVVVVVVVVVVVVVVVVVVVVSIiEhEiIiIRIiIiEiIiIiIiIiJSVVVVVVVVVVVVVVVVEREREREREREREREREhERVVVVVVVVVVVVVVVVVVVVVVURIiIiUSIiIlUAIiJVAFVVVQVVVVUFVVVVVVVVVVVVVRIREREiERFRUlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVSUiIlVVIiJVVSIiVVVVIlVVVSVVVVVVVVVVVVVVVVUSERERIhERESISEREiIhIRIiIiIiUiIiJVVVVVVVVVVRERESIRESEiERFSIhFSVSUiVVVVVVVVVVVVVVVVVVVVIhERESISEREiIhERIiIiESUiIiJVVVVVVVVVVVVVVVUREREhERERIhERUSIRUVUlVVVVVVVVVVVVVVVVVVVVVQUAAAAFAAAAVQAAAFUAAABVAAAAVQUAAFUFAABVBQAAUFVVVVBVVVVQVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAVQAAAFUAAABVBQAAVQUAAFUFAABVBQAAVQUAAABVVVUAVVVVAFVVVVBVVVVQVVVVUFVVVVBVVVVQVVVVVQUAAFUFAABVBQAAVVUAAFVVAABVVQAAVVUAAFVVAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVVUFAFBVBQBQVQUAUFVVAFBVVQBQVVUAUFVVAFBVVQBQVQUAAFUFAABVBQAAVQUAAFUFAABVBQAAVQUAAFUFAABVVQUAVVUFAFVVBQBVVQUAVVUFAFVVBQBVVQUAVVUFAFBVVVVQVVVVUFVVVQBVVVUAVVVVAFVVVQBQVVUAUFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVVBVVVVVVQBQVVUAUFVVAFBVVQBQVVUAUFVVAABVVQAAVVUAAFUAAABVAAAAVQAAAFUAAAAFAAAABQAAAAUAAAAFAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVVUFVVVVBVVVVVVQUAVVUFAFVVBQBVVQUAVVUFAFVVAABVVQAAVVUAAAAAVVUAAFVVAABQVQAAUFUAAABVAAAAUAAAAAAAAAAAVVVVBVVVVQVVVVUAVVVVAFVVBQBVVQAAVQUAAFUFAABQVVVVUFVVVVBVVVUAVVVVAFVVVQBVVVUAVVVVAFVVVVUFAABVBQAAVQUAAFUFAABVBQAAVQUAAFUAAABVAAAAVVVVVVVVVVVQVVVVUFVVVVBVVVUAVVVVAFVVVQBVVVVVVVVVVVVVVVVVVQVVVVUFVVVVAFVVVQBVVQUAVVUFAFBVVVVQVVVVAFVVVQBVVVUAVVVVAFBVVQBQVVUAUFVVVVUAAFVVAABVBQAAVQUAAFUFAABVAAAAVQAAAFUAAABQVVVVAFVVVQBQVVUAAFBVAAAAVQAAAFAAAAAAAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVUAUFVVVVVVVVVVVVVVVVVVVVVVAFVVBQBVVQAAVQAAAAAAAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAUFVVAFBVVQAAVVUAAFVVAABVVQAAUFUAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVVQVVAAAABQAAAAUAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAUFVVAABVVQAAVVUAAFBVAABQVQAAAFUAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVVQBVVQAAVQUAAFUAAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAVVUAAFVVAABQVQAAUFUAAABVAAAAVQAAAFAAAABQVVVVVVVVVVVVVVVVVVVVVVVVVQVVVVUFVVVVAFVVVQAFAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUFUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVUAAFVVAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVQUAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVQBVBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAAFUAAABQAAAAUAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVUAVVVVAFVVVVVVVQBVVVUAVVUFAFVVBQBVVQAAVQUAAFUAAABVAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVBVVVVQVVVVAFVVVQBQVVUAAFVVAABQVVVVVVVVVVVVVVVVVVVVVVUFUFVVAABQVQAAAFAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUAVVUAAFUAAABVVQUAVVUAAFUAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVQVVVVAFVVVQBVVVUAUFVVAABVVQAAUFUAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVQUAVVUAAFUFAABVBQAAVQAAAAUAAAAAAAAAAAAAAABQVVUAAFVVAABQVQAAAFUAAABQAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFVVVQBVVVVVVVVVVVVVVVVVVQVVVVUAVVUFAFVVAABVBQAAVQAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVQAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVUAVVVVAFBVVQAAVVUAAABVAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVBQBVBQAAVVUFAFVVAABVBQAABQAAAAAAAAAAAAAAAAAAAAAAAAAAUFVVAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVAFBVVQAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVUFVVVQBQVVUAAFVVAABQVQAAAFAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAFVVAABVVVUAVVUFAFVVAABVAAAABQAAAAAAAAAAAAAAAAAAAAAAVVUAAFBVAAAAVQAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVQBVVVUAAFVVAAAAUAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVUAVVUAAFUAAAAAAAAAVVVVVVUAAFUFAABQAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVAFVVVQAAVVUAAABVAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQVVVQUAVVVVVVVVVQVVVVUAVVUFAFUFAAAFAAAAAAAAAAAAAAAAVVVVAABVVQAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVVVVVVQBVVVUAAABQAAAAAAAAAAAAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVVVUAAAAAAAAAAAAAAAAAAFVVVVVVVVUFVVUAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAFBVVQAAUFUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVUAUFVVAAAAAAAAAAAAAAAAAAAAAFVVVVVVVVVVVVVVVVVVVVVVVQUAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVQUAVQAAAAAAAAAAAAAAAAAAAAAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVBVVVUAVVVVAFBVVQAAUFUAAABQAAAAAAAAAAAAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVVVQVVVVAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVVVVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVQUAVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQVVUAAABVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVVVVVVVVVQUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADCMwg1kEQKQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQSHFA0l2BBfGRApAAAAAAAAAAAAAAAAAAAAAAAAAIAAgACAAIAIgACACoAAgACAAIAAgACAAIAAgACACIAAgAGAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACoAAgACAAIAAgAqAAIAAgACAA4AAgACAAIAAgACAAIADgACAAIAJgACAAIAAgACAAIAAgACACIAAgAaAAIAAgACAAIAHgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgASAAIAAgACAAoAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAAgACAAIAAgACAB4AAgACAAIAAgACAAIAAgAWAAIACgACAAIAAgACAB4ABgACAAIAAgASAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAJgACAAIAAgACAAIAAgAKAAIAAgACAAIAAgAWAAIABgAmAAoAAgACAAIAAgACABoAAgACAAIAAgACAAIAAgACAAIAAgACABIAAgAWAAIAHgAqAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAIgACAB4ABgACAAIAAgACAA4AAgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAJgAGAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACAA4AEgACAA4AAgACAAIAAgACAAIAGgACABYAAgAaABYAAgACAB4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAA4AAgAKAAIAAgACAAIAAgACAAIACgACAAIAAgACAA4AAgACAAIAKgACAA4AAgACAAIAAgACAAIAGgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgACAAIAAgAaAAIAAgACAAIAAgAiAAIAAgACAAIAAgACACYAAgACAAIAAgAqAA4AAgACAAIAAgACACYAAgACAAIAFgACAAIAAgACAAIAAgACACYAAgACAAIAAgAGAAIAAgAaAAIAAgACAAIAAgACAAoAAgACAAIAEgASAAIAJgACAAIAAgACAAIAAgACAA4AAgACAAIAAgASAAIAAgACAAIAAgACAAIAAgACAAYAAgACAAIAAgAmAAIAAgAeAA4AAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAIAAgACAAIAAgACAAIAAgASAAIAAgASAAIAAgACAAIAGgACAAIAAgAiAAIAAgACAAIAAgAKAA4AAgACAAIAAgACAAIABgACACYAHgACAAIAIgACABoAAgACAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaAAIAAgACAAIAAgACABYAJgACAAIAAgACAAIAAgACAAIAAgACACIABgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaAAIAAgACABYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAoAAgACAAIAEgAWAAIAAgACAAIAAgACACoAAgAOAAIAAgACAAIAAgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIACgAaAAIAAgACAAIAAgACAAIAGgACAAIAAgACAAIAAgACAAIAAgAWAAIAAgACAAIAAgACABoAAgACAAIAAgAaAAIAAgACAAIAAgAKAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgACAAIAKgACAAIAAgACAAIAAgACAAoAAgACAAIAAgACAAIACgACAAIAAgACAAIAGgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgAqAAIAHgACAAIAAgAKAAIAAgACAAIAFgACAAIAAgAaAAIAAgACAAIAAgACAAIAAgAKAAIAAgACABYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAYAAgAKAAIABgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAYAJgACACIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAAgACAAoAAgASAAIAKgACAAIAAgACAAIAAgACAAIAHgACAAIAAgACAAIAAgACAAYAIgACAAIAAgACAAIAAgACAAIAEgACAAIAJgACAAoAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgAaAAIAKgACAAIAFgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABYAAgACAAIAAgACAAIAAgACAAIAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAuQAJALkAuQDJANkA6QD5AOkBCQEZAMkA2QAJAAkAuQC5ASkAuQAJATkBSQE5AOkACQAJAOkBWQEZAAkACQDJAOkACQDpAXkBiQGZAAkACQAJAAkACQGpAZkACQAJAbkBeQHJAXkACQAJAAkACQAJAAkACQAJAAkACQAJAAkBiQAJAAkACQAJAAkACQHpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQH5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkCGQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQJZAmkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQKpAAkACQAJAAkCuQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQLpAAkACQAJAAkACQAJAAkACQAJApkACQAJAvkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkDCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAokACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQMJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJA0kDWQNpAAkACQAJAAkACQAJAAkACQAJAAkDSQNpA3kDiQOJA4kDeQOJA4kDiQAJAAkACQAJA5kDqQOpA6kDqQO5A8kD2QOZA6kDqQOpA6kD6QP5A/kD+QQJBBkEKQQ5BEkEWQRpBDkESQRZBGkACQAJAAkACQS5BMkE2QTpBPkFCQUZBSkEuQU5BUkFWQT5BWkFeQWJBZkFqQW5BckF2QXpBfkGCQXZBekGGQYJBnkGiQaZBqkGuQbJBtkFOQbpBvkHCQcZBrkGyQbZBTkG6QcpBVkHOQbJB0kHWQdpB3kHiQeZB6kHeQeJB5kHqQAJAAkACQgZAAkACQAJAAkIKQAJAAkIOQAJAAkACQAJCCkACQAJAAkACQAJAAkISQAJAAkACQgZAAkACQAJCBkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQDZAAkACQDpAAkACQFpAAkACQC5ASkAuQAJAAkAuQEpALkAuQEpALkBOQAJAAkBCQEZAAkACQDJANkACQDJANkBmQAJAAkACQAJAAkACQAJAAkA6QD5AOkACQAJAXkByQF5AdkByQF5AAkACQAJAAkACQAJAAkBqQGZAAkBiQGZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAgkACQAJAAkB6QAJAAkACQAJAAkACQIpAAkCOQAJAAkACQAJAAkACQIZAAkACQAJAAkACQAJAAkCSQAJAAkACQAJAAkACQAJAAkACQAJAAkACQJ5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkCiQAJAAkACQAJAAkACQAJAAkACQAJAAkCmQAJAAkACQAJAAkACQAJAskACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQLZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAekACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAxkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQH5AAkACQAJAAkACQAJAAkACQAJAAkDKQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAgkACQAJAAkACQAJAAkACQAJAAkACQM5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkDeQOJA4kDiQAJAAkDeQOJA4kDiQAJAAkACQAJAAkACQN5A4kDiQAJAAkACQAJAAkACQAJAAkACQAJA5kDqQOpBDkESQRZBGkACQAJBDkESQRZBGkDmQOpA6kDqQR5BIkEmQPJA9kEeQSpBIkEeQSpBKkEqQSJAAkACQUJBikFKQXZBekGGQYJAAkACQY5BkkGGQYJBlkGaQYZBgkFuQXJBQkFGQUpBQkFGQUpBLkFOQVJBVkE+QAJAAkG+QcJB7kHeQeJB5kHqQfJB9kHeQeJB5kHqQd5B4kHmQepB+kHaQb5BwkHGQb5BwkHGQa5BskG2QU5BukH+QgJAAkACQg5AAkACQAJCBkACQhJAAkACQAJCBkACQAJAAkIGQAJCEkACQAJCDkACQAJCDkACQAJAAkACQgpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAxAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAADEBACIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiIhIiIiISIiIiEiIiIhIiIiISIiIiEiIiIhIhIiIiISIiIiEiIiIhIiIiISIiIiEiIiIhIiIiISIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIjMzMzMAAAAAIhIhIiISISIiEiEiIhIhIiISISIiEiEiMxMxMwAAAAAiIiISIiIiEiIiIhIiIiISMzMzEwAAAAAAAAAAAAAAACEiIiIhIiIiISIiIiEiIiIxMzMzAAAAAAAAAAAAAAAAIhIhIiISISIiEiEiIhIhIiISISIiEiEiIhIhIiISISIiIiIiIiIiIiIiIiIiIiIiMzMzMwAAAAAAAAAAAAAAACISISIiEiEiIhIhIiISISIzEzEzAAAAAAAAAAAAAAAAIiIiEiIiIhIiVSISIlUiEjMzMxMAAAAAAAAAAAAAAAAiIiIiIiIiIiJVIiIiVSIiMzMzMwAAAAAAAAAAAAAAACIiIiIiIiIiMzMzMwAAAAAAAAAAAAAAAAAAAAAAAAAAIlUiEiJVIhIzMzMTAAAAAAAAAAAAAAAAAAAAAAAAAAAhIiIiISIiIjEzMzMAAAAAAAAAAAAAAAAAAAAAAAAAACIiIhIiIiISMzMzEwAAAAAAAAAAAAAAAAAAAAAAAAAAIiIiIiIiIiIiIiIiIiIiIiJVIiIiVSIiMzMzMwAAAAAiEiEiIhIhIjMTMTMAAAAAAAAAAAAAAAAAAAAAAAAAACJVIiIiVSIiMzMzMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABEBEQzRDREIyIiIgAAAAAAAAAAAEAAQABAAEAAQABABEQERDRENEQiIiIiAAAAAAAAAAAAQAAAAEAAAABAAAAERAQANEQ0MyIiIiIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzMzMzIyIiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMzMzMiIiIiAAAAAAAAAAAAAAAAAAAAADMzMzMjIiIiIyIiIiMiIiIAAAAAAAAAAAAAAAAAAAAAMzMzMyIiIiIiIiIiIiIiIiMiIiIjIiIiIxEhIiMiEhEjUlUiI1JVIiMiIiIjIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIRIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhEiIiIiIgAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQABAAEAARAREAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQAREBEQAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAAAQAAABEQEACMiIiIjIiIiIxEiIiMiESEjIiISIyIiIiMiIiIjIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiISESIiIiIRIiIiIiIjIiIiIyIiIiMRESIjIiIRIyIiIiMiIiIjIiIiIyIiIiIiIiIiIiIiIiIiIhERISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhEiIiIiEREiIiIiIgBAAEAAQABAAEAAQABEBEQzRDREIyIiIiMiIiIjIiIiAEAAAABAAAAAQAAABEQEADRENDMiIiIiIiIiIiIiIiIjIiIiIyIiIiMRISIjIhIRIyIiIiMiIiIjIiIiIyIiIgBAAEAAQABAAEAAQAREBEQ0RDREIiIiIiIiIiIiIiIiIxERISMiIhIjIiIiIyIiIiMiIiIjIiIiIxERISMiIhIiIiIiERERESIiIiIiIiJSIiIiUiIiIiIiIiIiERERESIiIiIiIiIiEREREVUiIiJVIiIiIiIiIiIiIiIiIiIiIiIiIlJVIiJSVSIiERERESIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIhIiIiEhERIiIiIiIiIiIiIiIiIiMRISIjIhIRIyIiIiMiIiIjIiIiIyIiIiMRISIjIhIRIiIiIhEiIiIiEREiIiIiESIiIiIiIiIiIiIiIhEiIiIiIiIiIiIiIiIiIiIRISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIjNENEQjIiIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiNEQ0RCIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiI0RDREIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIjRENEQiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERNEQ0MyIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiIjESIiIyIRISMiIhIjIiIiIyIiIiMiIiIjESIiIyIRISIiIiIiIiIiISIiIhIRIiIiIhEiIiIiIiIiIiIiIiIiIxERIiMiIhEjIiIiIyIiIiMiIiIjIiIiIxERIiMiIhEiIiIiEREhIiIiEhEiIiIiIiIiIiIiIiIiIiIiEREhIiIiIiIiIiIiESFSVSISUVUiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIiIiIiIiIiIiIiIiIiIiIiIhEhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIiIiJVJSIiVRURIiIiIhEiIiIiIiIiIiIiIiIRIiIiIxERIiMiIhEjIiIiIyIiIiMiIlUjIiJVIxERIiMiIhEiIiIiEREhIiIiEhEiIiIiJSIiIiUiIiIiIiIiEREhIiMREVIjIiJRIyIiIiMiIiIjIiIiIyIiIiMRESIjIiIRVSIiIlURISIiIhIRUlUiIlJVIiIiIiIiIiIiIhERISIzMzMzIyIiIiMiIiIjIiIiIxERIiMiIhEjIiIiIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiEREhIiIiEhEiIiIiMzMzMyIiIiIiIiIiIiIiIiIiIiIiIiIiESEiIiISEREzMzMzIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiESIiIiMiIiIjIiIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIRERERIiIiIiIiIiIiIiIiIiIiIiIiIiIRERERIiIiIiIiIiIhIiIiEhERIiIiIiIiIiIiIiIiIiIiIiIhIiIiIyIiIiMiIiIjIiIiIyIiIiMRISIjIhIRIyIiIiMiIiIiEREiIiIiESIiIiIiIiIiIiIiIhEiIiIiEREiIiIiESIiIiIRISIiIhIRIiIiIiIiIiIiIiIiIiIiIiIRISIiIyIiIiMiIiIjEREhIyIiEiMiIiIjIiIiIyIiIiMiIiIiIiIiIiIiIiIiIiIiIiIiERERESIiIiIiIiIiIiIiIhIRESIiIiIiIiIiIiIiIiIiIiIiISIiIhIRESIiIiIiIyIiEiMiIiIjIiIiIyIiIiMRUlUjIlFVIyIiEiMiIiIhIiIiEhEiIiIiESIiIiIiIiIiIiIiIiIhIiIiEhEiIiMiIiIjIiIiIyIiIiMiIiIjEREiIyIiESMiIiIjIiIiIiISESIiIiIiIiIiIiIiIiIiIiIRESEiIiISESIiIiIRISIiIhIRESIiIiIiIiIiIiIiIiIiIiIRISIiIhIRESIiIiIRIiIiIhERIiIiIiIiIiIiIiIiIiIiIiIRIiIiIiIiIlFVIiJSVREiIiIiIiIiIiIiIiIiIiIiIhEhIiIzMzMzIyIiIiMiIiIjIiIiI1FVIiNSVSEjIiISIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiIiIiIiEiIiISESIiIyIiEiMiIiIjIiIiIyIiIiMRIiIjIhEhIyIiEiMiIiIzMzMzIyIiIiMiIiIjIiIiIxEhIiMiEhEjIiIiIyIiIjMzMzMiIiIiIiIiIiIiIiIiIiIiESIiIiIRESIiIiIRABERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjNFBi/38UfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/3+fQ1R/kH7MSFRhXHpfQwAAAAAAAAAAAAAAAAAAAIAAgACAAIAAgACAAIAAgACAAIAAgAGAAIAKgACAAIAEgACAAIAAgACAAIAAgASAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgACAAYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABIAAgAGAAoACgACAAIAHgACAAIAAgACAAIAAgASAAIAKgACAAIAAgACABIAAgACAAIAAgACAAIAAgACAAIACgACAAIAAgAKAAIAAgACAAIAAgACAAIAKgACAAIAAgAGAAIAGgACAAIAAgACAAIAAgACAAIAAgACAAIAKgACAAIAAgAKAAIAAgACAAIAAgACAAYAAgACAAIAAgACAAIAAgACAAIAJgACAAIAAgACAAIAAgAiAAIAIgACAAIAAgACAAIABgACAAoABgACAAIAAgACAAIAAgACAAIAAgACAAIADgAqAAIAAgACABoAAgAWABYAAgACAAIAAgAaAAIAAgASAAIAGgACAAIACgACAAIAJgACAAIAAgAmAAIAAgAGAAIAAgACAAIAAgACAAIAAgACAAIAFgACAAIAHgAaACoAAgACAAIAAgACAAIAAgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABIAAgACABYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAWAAIAAgACAAIAFgACAAIAAgACAAIAAgACABYAAgAiAAIAAgACACoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeACoAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAmAAIAHgACAAIAEgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgAeAAIAAgACAAoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAeAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIACgAOAAIAJgACAAIAAgAKAAIAAgACAAIAAgACAA4AIgACAAIABgACAAIAAgACAAIAGgACAAIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACACIAAgACAAIAAgAeAAIAFgACAAIAHgACAAIAAgACACYAGgACACoAAgACAAIAAgACAB4AAgACABoAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAGgACAAIAAgACAAIAAgACAAIAAgACAAIADgAGAAIAAgACAAIAAgACAAIAAgACAAIABgACAAIAAgACAAIAAgACAAIAAgACAAIAAgASACYAEgAeAAIAAgACAAIAAgACAAIABgACAAIAAgAiAAIAAgACAAIAAgAWAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIADgACAAIAAgACAB4AAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAOAAIAAgACAAoAAgACAAIAAgACAAIAAgACAB4AAgAGAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoAAgACAAIAAgAGAAIAAgACAAIAAgAOAAIAAgACAAIAAgACACIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAIAAgAmAAIAAgACAAIAJgACACoAAgACAAIAAgACAAIAAgACAAIAAgACAAIABgACAAIAAgACAAIABgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAqAAoAAgACAAIAJgACAAIAAgACAAIAAgACAAIAAgACAAIAJgACAAIACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIACgACAAIAAgACAAIAJgACAAIAEgAiACoAAgAWAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAHgACAAIAAgAGAAIAAgACAB4AAgACABIAAgACACoAAgACAAIAKgACAAIAAgACAAIAAgACAAYAAgACAAIAAgACAAIAAgACACYAAgACAAIAAgACAAIAAgACAAIAAgACAAIAEgAKAAIAAgAGAAIAAgACAAIAAgACAAIAAgAGAAIAAgACAAIAHgACAAIABgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgAaAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAGACIAAgACAAIADgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACoAAgACAAIAAgACAAIAAgACAAIAAgAiAAIAAgACAAIAAgAaAAIAAgACAAIAAgACAAIABgACAAIAAgAOAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAWACYADgACAAIAAgACAAIAAgACAAIAAgAqAAIAAgAeAAIAEgACAAIAAgACAAIAAgACAAIAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQC5AMkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQEZASkACQAJAAkACQE5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAUkACQG5AckACQAJAAkACQAJAdkB6QH5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAgkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQJJAAkACQAJAAkACQAJAlkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJArkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkD+QAJAAkACQQJAAkEGQAJAAkACQAJAAkACQE5BLkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBMkE2QAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBVkFaQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFqQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQW5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFyQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkGCQYZAAkACQAJBikACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBjkGSQAJAAkACQAJAAkACQAJAAkACQAJAAkACQZZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQapBrkGyQAJAAkAOQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkECQAJAAkHOQAJB0kACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBukACQAJAAkACQAJAAkHWQAJAAkACQdpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQd5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJANkACQAJAAkACQDpAPkACQAJAQkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkBGQAJAAkBWQAJAAkACQAJAAkBaQF5AAkBiQAJAAkACQAJAAkBmQGpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQIZAAkCKQI5AAkACQAJAAkACQAJAAkBCQAJAAkACQAJAAkACQAJAAkACQJpAnkCiQKZAAkACQAJAAkACQAJAAkACQAJAAkCqQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAskC2QLpAvkDCQMZAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAykBeQAJAAkACQAJAzkDSQNZA2kDeQOJA5kDqQO5A8kACQAJAAkACQAJAAkACQAJAAkACQAJAAkD2QPpAAkACQAJAAkACQAJAAkACQAJBCkEOQRJBFkEaQR5BIkEmQAJAAkACQAJAAkACQAJAAkACQAJAAkEqQAJAAkACQAJAAkACQAJAAkE6QAJAAkE+QAJAAkFCQUZBSkFOQVJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkFeQWJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAdkB6QAJAAkACQAJBZkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQXZAAkACQAJAAkACQAJAAkACQAJAAkACQXpAAkACQAJAAkACQX5AAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJBmkGeQF5AAkACQAJAAkACQAJAAkACQAJBokGmQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkG2QAJAAkACQAJAAkACQAJAAkG6QAJAAkACQAJAAkACQAJAAkG+QAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQcJAAkACQAJBxkACQAJAAkACQAJAAkACQAJAAkACQcpAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAUkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAABATAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAEAABATAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQQAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEEAAAAEAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAANAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAUAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAEEAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAEAAAAAUBAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAABDAAAAAAAABAAAQEIAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAUFUAAFVVAFBVVQBVVWVQVVVmAABVVVBVVVVVVVVVVVVVVVVVZmZlZmZmZmZ2d2Z2d3dVVQUAVVVVVVVVVVVVVVVVZlZVVWZmZlV3d2Zmd3d3ZgAAAAAAAAAAVQAAAFVVAABVVQUAVVVVAFVVVQVWVVVVBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAUAAAAFUAAABVAABQVQAAUFUAAIiIVVVlZlVVZmZVZWZmVWZmdlVmZnZlZmZ3ZWaIiIgIAABmd3d3dnd3d3d3d3d3d3d3d3d3d3d3d3eIiIiIAAAAAHd3d2d3d3d3d3d3d3d3d3d3d3d3d3d3d4iIiIgAAAAAZlVVVWZWVVVnZlVVd2ZWVXdmVlV3Z2ZViIhoVQAAAIgFAAAAVQAAAFUAAABVBQAAVQUAAFVVAABVVQAAiIgIAAAAAAAAAAAAAAAAAAAAAEAAAAAkAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAgAEAAIAAAACAAAAIAAAACAAIAIAIAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAIgAAAAAAFVVAABVVQAAVVUAAFVVAABVVQAAVVUAAFVVAGBmd2ZmZndmZmZ3ZmZmd2ZmZnZmZmZ2ZmZmZmVmZmZ3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3dnd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d2dmAHdnZlZ3Z2ZWd2dmVndmZlZ3ZmZWZ2ZmVmZmZlUAAACAVVUFAFVVBQBVVQUAVVUFAFVVBQBVVQUAVVUFAIgAAAAAAIgAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAIAAAACAAAAAgAAIgAAAAAAAAAAAAAQAAAADQAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAABAQwAAAAQAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAgAAACAiAgAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVAABQVYiIUFUAAIiIAAAAVQAAAFUAAABQAAAAUGVmZmZlZmZmVWZmZoiIZmZVZYiIVVVmZlVVZWZVVVVmZnd3d2Z2d3dmZnZ3ZmZmZoiIiIhmZmZmZmZmZmZmZmZ3d3dnd3d3Znd3ZmZmZmZmiIiIiGZmZmZmZmZmZmZmZmZmZlVmZmZVZmZWVWZmhoiIiFhVZlZVVWZVVVVWVVVVVVUFAFVVAABVVYCIiIgIAFUFAABVBQAAVQAAAFUAAAAAAACIAIiIAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVVVWVQVVVVAFVVVQBQVVUAAFVVAABQVQAAAFAAAAAAZmZmZmVmZmZVVWZmVVVVVVVVVVVVVVVVVVVVVVBVVVVmZmZmZmZmVWZWVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBVVVVQBVVQUAVVUAAFUAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAACQEAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEEAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAADAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZgAAYHYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmBgAAd2YAAAAABAAAQEIAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2dwBgdncAZnd3AGZ3dwBmd3cAZnZ3AGZ2dwBgZnZ3dwYAd3dmAHd3ZwZ3d2cGd3dnBnd3ZgZ3d2YGd2ZmAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAFAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAADQAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAGZmAABgZgAAAGYAAAAAAAAAAAAAAAAAAAAAAAAAAGZmBgBmZgAAZgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAADAAAAAAAAAAAAAAAAQAAEBDAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAQEEBAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAFAQAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAACQEAABAAAAAAAAAAHAAcABwAHAAcAFwAnADcARwBXAGcAFwB3AIcAlwAHAKcAtwDHANcA5wAnAPcBBwAHAAcABwAHAAcABwAHAAcABwAHAAcBFwEnATcBRwFXAWcBdwGHAZcBpwAHAbcBxwHXAecBRwH3AgcCFwAHAAcABwAHAAcABwAHAAcABwInAjcCRwJXAmcCdwKHApcCpwKHArcCxwLXAucC9wMHAxcDJwM3A0cDVwAHA2cDdwAHAAcABwAHAAcABwEXA4cDlwOnA7cDxwOXA9cD5wP3BAcEFwQnBDcERwRXA4cDlwOXBGcEdwSHBJcEpwAHAAcABwAHAAcABwEXBLcExwTXBOcE9wTHBQcEpwUXBScABwU3BKcFFwVHBLcExwVXBRcFZwV3BQcEpwAHAAcABwAHAAcABwEXBYcFlwWnBbcFxwXXBecEpwW3BfcABwYHBKcFtwYXBYcF1wYnBbcF9wY3BecEpwAHAAcABwAHAAcABwEXBkcGVwZnBncGhwAHBpcGpwa3BscG1wbnBvcHBwcXBycHNwc3BncGhwAHBpcEpwAHAAcABwAHAAcABwAHB0cABwdXB2cHdwAHB4cHlwenB6cHtweHB6cHpwAHB8cHpwenB2cHdwAHB4cH1wAHAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAAAARERERVVVVVczMzMxVERERIrG7GyKxABAiERERAAAAAAEQEQEBEFUBERHMAVURVbEiESKxIhEisSIRIrEAAAAAABAREQAQVREAEMwRABBVEQAQIhEAECIRABAiEQAAAAARAQAAVQEAAMwBAABVsQAAIrEAACKxAAAisQAAAAAAAAAQEQEAEFUBABDMAQAQVbEAECKxABAisQAQIrEAAAAAEREREVVVVVXMzMzMVRERESKxu7sisQAAIhEREQAAAAARERERVRFVVcwRzMwRERERu7sAGwAAABABAAAQAAAAABEREQFVVVUBzMzMAVUREbEisbu7IrEAACKxAAAAAAAAAAAQEQAAEFUAEBHMABBVEQAQIgEAECKxABAiEQAAAAARERERVVVVEczMzBERERERu7u7uwAAAAAREQEAAAAAABERERFVVVVVzMzMzBERVREAGyKxABAisQAQIrEAAAAAEQEQEVUBEFXMERHMERFVEbsbIgEAECKxABAisQAAAAAREQEQVVUBEMzMEREREVURuxsiEQAQIhEAECIRAAAAAAEQEQEBEFUBERHMEVURVVUiESIiIhEiESIRIhEAAAAAABARAQAQVQEREcwBEVVVsREiIrEiESKxIhEisQAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQIiIiIjMzMzMzERERM7G7GzOxABAzERERREREREREREQRESKxEREzsTMRM7EzETOxMxEzsTMRMxERERFEAbsQRAAQIhEAEDMRABAzEQAQMxEAEDMREREzEUREERFERAEbIrEAADOxAAAzsQAAM7EAADOxAAAzERERREREREREREQAECKxABAzsQAQM7EAEDOxABAzsRERMxFEEURERBFERAAAABAAAAAQAAAAEAAAABAAAAAQEREREURERBFEREQRIiIiIjMzMzMzERERM7G7uzOxAAAzERERREREREREREQBAAAQAQAAELEAABC7AAAQAAAAEBEBABBEAQAQRAEAECKxAAAzsQAAM7EAADOxAAAzsQAAM7EAAESxAABEsQAAABARIgAAEDMAABARAAAAAAAAAAAAEBERABBERAAQREQiIgEAMzMRARERMwG7GzMBABAzsRERM7FERBGxREQBuwAQIrEAEDOxABAzsQAQM7EAEDOxABAzsQAQRLEAEESxABAisQAQM7EAEDOxABAzsQAQM7EAEDMRABARRAAAEEQiIiIiMzMzMzMRMxEzETMRMxERMzOxEDNEsRARRLEAEBERIhEBGzMRsRAzEbEQM7EBEDOxEREzsUQRRLFEEUSxIhEisTMRM7ERETOxABszsQAQM7EAEDOxABBEsQAQRLEAAAAAAAAAAAAAAAAAAAAQAAAAEAAAABAAAAAQAAAAEAAAAAAAAAAAAAAAABERERFVVVVVVVVVVVVVVVVVVVVVAAAAEAAAAAAAAAAAEREREVVVVVVVVVVVVVVVVVVVVVURERERALu7uwAAAAAREQEAVVUBAFVVAQBVVbEAVVWxALEAEBG7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAERGxELu7uwAAAAAAABEREQBRVVUAUVVVAFFVVQBRVVURERERALu7uwAAAAARERERVVVVVVVVVVVVVVVVVVVVVRERERG7uwC7AAAAABEBAABVAQAAVQEAAFWxAABVsQAAEREREbu7u7sAAAAAABAREQAQVVUAEFVVABBVVQAQVVURsQAQu7sAAAAAAAARERERVVVVVVVVVVVVVVVVVVVVVRGxAAAAuwAAAAAAABEREQBVVRUAVVUVAFVVFQtVVRULAAAAAAAAAAAAAAAAEBERERBVVVUQVVVVEFVVVRBVVVUAEBERAAAAuwAAAAARERERVVVVVVVVVVVVVVVVVVVVVRERsQC7u7sAAAAAABEREQFVVVUBVVVVAVVVVbFVVVWxABARsQAAALsAAAAAAAAAEAAAABAAAAAQAAAAEAAAABAAABARAAAAAAAAAAARERERVVVVVVVVVVVVVVVVVVVVVRERsRC7u7sAAAAAABERERFVVVVVVVVVVVVVVVVVVVVVEbEAEAC7AAAAAAAAEREREVVVVVVVVVVVVVVVVVVVVVURERGxALsAuwAAAAARABARFQAQVRUAEFUVCxBVFQsQVQAQEbEAAAC7AAAAABERAABVFQAAVRUAAFUVCwBVFQsAAAAAAAAAAAAAAAAAEBERERBVVRUQVVUVEFVVFRBVVRUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALAAAACwAAAGZmZmZVVRURZmYWu2ZmFgtmZhYLZmYWC2ZmFgtmZhYLZmZmZhERERG7u7u7AAAAAAAAAAAAAAAAAAAAAAAAAABmZhERERFVVbsbZmYAEGZmABBmZgAQZmYAEGZmABBmZhEAEBEVABBVFgAQZhYLEGYWCxBmFgsQZhYLEGYWCxBmEWFmZlUVERFmFrC7ZhYLAGYWCwBmFgsAZhYLAGYWCwBmEREREVVVFRtmZhYQZmYWEGZmFhBmZhYQZmYWEGZmFgAQZmYAEBERAAAAuwsAAAALAAAACwAAAAsAAAALAAAAZmZmZhEREVW7uxtmAAAQZgAAEGYAABBmAAAQZgAAEGZmZmZmVRUREWYWu7tmFgsAZhYLAGYWCwBmFgsAZhYLAGZmFgsRERELu7u7CwAAAAAAAAAAAAAAAAAAAAAAAAAAEGZmZhBVVRUQZmYWEGZmFhBmZhYQZmYWEGZmFhBmZhZmZmZmEREREbu7u7sLAAAACwAAAAsAAAALAAAACwAAAGZmZhERERFVu7sbZgAAEGYAABBmAAAQZgAAEGYAABBmEREAEFUVABBmFgAQZhYLEGYWCxBmFgsQZhYLEGYWCxAWCxBmEQsQVbsLEGYAABBmAAAQZgAAEGYAABBmAAAQZmYWERFVVVVVZmZmZmZmZmZmZmZmZmZmZmYWERFmFrsbAQAAAAEAAAABAAAAsQAAALEAAAAREREAZmYWAGZmFgAQZmYWEFVVFRBmZhYQZmYWEGZmFhBmZhYQZmYWEGZmFgsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAAd3cXC3d3Fwt3dxcRd3d3d3d3d3d3d3d3d3d3d3d3d3cAAAAAAAAAABERERF3d3d3d3d3d3d3d3d3d3d3d3d3dwAQd3cAEHd3ERF3d3d3ERF3dwG7d3exAHd3sQB3d7EAFwsQdxcLEHcXCxB3EQsQd7sLEHcAABB3AAAQdwAAEHd3FwsAdxcLAHcXERF3d3d3d3d3d3d3d3d3d3d3d3d3dxB3dxcQd3cXEXd3F3d3dxd3d3cXd3d3F3d3dxd3d3cXAAAQdwAAEHcAABB3AAAQdwAAEHcAABB3AAAQdwAAEHd3FwsAdxcLAHcXCwB3FwsAdxcLAHcXCwB3FwsAdxcLABB3dxcQd3cXEHd3FxB3dxcQd3cXEHd3FxB3dxcQd3cXdxcLEHcXCxB3FwsQdxcLEHcXCxB3FwsQdxcLEHcXCxAAAAAAAAAAABERAQB3dwEAd3cBAHd3sQB3d7EAd3exAHcXCxB3FwsQdxcLEHcXCxB3FwsAdxcLAHcXCwB3FwsAd3cXC3d3Fwt3dxcRERFxdwC7cXcAAHF3AABxdwAAcXeIiBgRiIgYu4iIGAuIiBgLiIgYC4iIGAuIiBgLiIgYCxGIiBgbiIgYEIiIGBCIiBgQiIgYEBERgQAAu4EAAACBERGxALu7uwALAAAACwAAABERAQCIiAEAiIgBAIiIsQAAABCIAAAQiAAAEIgAABCIAAAQiAAAEIgAABCIAAAQiIgYERGIGLu7iBgLAIgYCwCIGAsAiBgLAIgYCwCIGAsAEREREbu7u7sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARiIgYG4iIGBCIiBgQiIgYEIiIGBCIiBgQiIgYEIiIGIgYCwCIGAsAiBgLAIgYCwCIGAsAiBgLAIgYCwCIGAsAEIiIGBCIiBgQiIgYEIiIGBCIiBgQiIgYEIiIGBCIiBiIGAsQiBgLEIgYCxCIGAsQiBgLEIgYCxCIGAsQiBgLEBERsQC7u7sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAREQAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACZmRkLmZkZC5mZGQuZmRkLqqoaC6qqGguqqhoLERERCwAAAJEAAACRAAAAEQAAAAAAAAAAAAAAAAAAAAAAAAAAmZmxAJmZEREREZmZsBuZmQAQqqoAEKqqABCqqgAQEREAABCZEQAQmRkAEJkZABCZGgsQqhoLEKoaCxCqEQsQEZkZCwCZGQsAmRkLAJkZCwCqGgsAqhoLAKoaCwAREQsAEJmZGRCZmRkQmZkZEJmZGRCqqhoQqqoaEKqqGhARERELAAAACxAREQsQmZkLEJmZCxCqqgsQqqoLEKqqCxAREQAAEJkRERGZmZmZmZmZmZmqqqqqqqqqqqqqqqoRERERmRkLAJkZERGZmZmZmZmZmaqqqqqqqqqqqqqqqhEREREAAAAAERERAJmZGQCZmRkAqqoaC6qqGguqqhoLERERCxCZmRkQmZkZEJmZmRCZmZkQqqqqEKqqqhCqqqoQERERCwAAABERERGZmZmZmZmZmaqqqqqqqqqqqqqqqhEREREAABCZERERmZmZmRGZmZkBqqqqsaqqqrGqqqqxERERsZkZCxCZGQsQERELELu7CxAAAAAQAAAAEAAAABAAAAAQmZkZC5mZGRGZmZmZmZmZmaqqqqqqqqqqqqqqqhEREREAAAAAEREREZmZmZmZmZmZqqqqqqqqqqqqqqqqEREREQC7uwsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC7CwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALu7CwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC7uwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALAAC7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALu7u7sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu7u7CwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu7u7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREREREREREREREREREREREREREREREREREREREREREAAAAAQEREREAzMzNAIyIiQCMREUAjERFAIxERQCMREQAAAABEREREMzMzMyIiIiIRERERERERERERERERERERAAAAAERERAAzMzMEIiIyBBERMgQRETIEEREyBBERMgRAIxERQCMREUAjERFAIxERQCMREUAjERFAIxERQCMRERERMgQRETIEEREyBBERMgQRETIEEREyBBERMgQRETIEQCMREUAjERFAIxERQCMiIkAzMzNAREREAAAAAAAAAAAREREREREREREREREiIiIiMzMzM0REREQAAAAAAAAAABERMgQRETIEEREyBCIiMgQzMzMEREREAAAAAAAAAAAAAAAAAERERERVVVVVVVVVVWZmZmZmZmZmRERERAAAAAAAAAAARERERBQREREUERERFBERERQRERFEREREAAAAAAAAAABEREREVVUREVVVERFmZhERZmYREUREREQAAAAAAAAAAAAAAAAAAAAAMzMzMyIiIiIAAAAAAAAAAAAAAAAAAAAwAAAAIwAAMAIAACMAADACAAAjAAAwAgAAIwAAACMAAAAwAgAAACMAAAAwAgAAACMAAAAwAgAAACMAAAAwAEREAEAzMwQ0d3dDNHd3QzR3d0M0d3dDQDMzBABERAAAREQAQDMzBDSIiEI0iIhCNIiIQjSIiEJAIiIEAEREAABwAAAAcAcAd3d3AHd3dwd3d3cAAHAHAABwAAAAAAAAozT/fwAIYhwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ8jZgBiHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQghfEl8SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADuSQAIYhwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIx/YBhiHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXykGAGIcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACfcgYQYhwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACEMaH9EdmNd/3/fM98anxGaIE4YxjDUf39TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGIc62l4fyEQ3BhIDJ8jijtfEth9/39GUTBOH2KMfwAA7kuAAGIc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AAAAAMwzIhfMIyIBLCJiASIiERciEQABEQEAAAAAAAAAAAAAAAAAAAAAAAAAABARAAARMwAQMzMAMczMEMKMiBDMGIEAAAAAAAAAABEBAAAjERAAMyNhATMzEhc8MyIByDMiFhDMGIEQzIiIAMGMiAAQzMwAABEiAAAQEQAAAAAAAAAAyDMiF8gjIgEsImIBIiIRFyIRAAERAQAAAAAAAAAAAAAAAAARAAARRAAQREQAEEREAEFERBBEREQQREREQUTkRAEAAAAUAQAARBQAAEREEQBEREQBREREAURERBTkREQUQUTkREREQkRERERORKpK5EGkqqoQRKSqABEREQAAAADkREQUREJERE5EREREpKpEqqpKFKpKRAEREREAAAAAAAAAAAAAAAARAAARRAAQREQAEEREAEFERBBEREQQREREAAAAAAEAAAAUAQAARBQAAEREEQBEREQBREREAURERBRBROREQUTkREREQkRERERORKpK5EGkqqoQRKSqABEREeRERBTkREQUREJERE5EREREpKpEqqpKFKpKRAEREREAAAAAAAAAAAAAABERABBVVQBR5VURXFVVwVxVVRARVVUAAAAAAAAAAAAAAAABAAAAFQAAABUAAAAVAAAAARARAAAQVVUAUVVVAFFlZgBRVWYAEFVVAAAREQAAqakAAAAAFVFVAVVVVQFVVVUBZlUVAFVVEQAREQAAqakAAAAAAAAAAAAAAAAAAAAAEREAEFVVAFHlVRFcVVXBXFVVEBFVVQAAAAAAAAAAAAAAAAEAAAAVAAAAFQAAABUAAAABEBEAABBVVQBRVVUAUWVmAFFVZgAQVVUAABERAACamgAAAAAVUVUBVVVVAVVVVQFmVRUAVVURABERAACamgAAAAAAAAAAAAAAAAAAABAREQAQ3d0AEBERAAAAAREQERHBkZlJAAAAAAAAAAAREREA3d0dABEREQAAAQAAERERAZSZmRkRkZlJARAREQAQ3d0AEBERAAAAAQAAEB4AAAABAAAAAJSZmREREREA3d0dABEREQAQAAAAEB4AAAABAAAAAAAAAAAAAAAAAAAAEBERABDd3QAQEREAAAABARARERGRmUkAAAAAAAAAABEREQDd3R0AERERAAABAAAREREBlJmZGcGRmUkBEBERABDd3QAQEREAAAABAAAQHgAAAAEAAAAAlJmZEREREQDd3R0AERERABAAAAAQHgAAAAEAAAAAAAAAABEAABAiEQAhIiIAISIiACEkMxAiMjMQIuMzECIzMwARAAARIgEAIiISACIiEgAzIhIAMyMiATM+IgEzMyIBECIzMxAiM90QIjIzISIiMyEiIiIhIiIRECISAAARAQAzMyIB3TMiATMjIgEzIiISIiIiEhEiIhIAISIBABARAAAAAAAAABEAABAiEQAhIiIAISIiACEkMxAiMjMQIuMzAAAAAAARAAARIgEAIiISACIiEgAzIhIAMyMiATM+IgEQIjMzECIzMxAiMt0hIiIzISIiIiEiIhEQIhIAABEBADMzIgEzMyIB3SMiATMiIhIiIiISESIiEgAhIgEAEBEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAEQAAEREAAAAAAAAAEQAAEBEAEBGZEBGRmRGRmaqRmamqmamqqgEAAAARAQAAGREBAJkZERGamYiIqpp3d6qqd3eqqnd3AAAAAAAAAAAAAAAAERERAYiIiBh3d3cXd3d3F3d3dxcAABGZAAARmQAAERkAABEZAAARMQAAETEAABEzAAARM5kREREaMTMTMTMzMzNDRDQzFEFEQxERRBTdHUEU3R1BqqqqqqGqqqoToaqqM6GqqjMTqqo0E6GqRDOhqkQzoaqZmRERqpmZEaqqmRGqqpkRqmZmZqp2ZmaqdmZmqnZmZgAAETMAABEzAAARMQAAETEAABEZAAARGQAAEZkAABGZFN0dQRTdHUFDERFEMxRBRDNDRDQxMzMzGjEzE5kRERFEM6GqRDOhqjQToaozE6qqM6GqqhOhqqqhqqqqqqqIiKp2ZmaqdmZmqnZmZqpmZmaqqpkRqqqZEaqZmRGIiIgYAAAREQAAABEAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAACZqaqqkZmpqhGRmaoQEZGZABARmQAAEBEAAAARAAAAAKqqd3eqqnd3qpp3d5qZGRGZGREBGREBABEBAAABAAAAd3d3F3d3dxd3d3cXERERAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAARAAAREQAAAAAAAAARAAAQEQAQEZkQEZGZEZGZqpGZqaqZqaqqAQAAABEBAAAZEQEAmRkREZqZiIiqmnd3qqp3d6qqd3cAAAAAAAAAAAAAAAAREREBiIiIGHd3dxd3d3cXd3d3FwAAEZkAABGZAAARGQAAERkAABExAAARMQAAETMAABEzmRERERoxMxMxMzMzM1NVNTMVUVVTERFVFd0dURXdHVGqqqqqoaqqqhOhqqozoaqqMxOqqjUToapVM6GqVTOhqpmZERGqmZkRqqqZEaqqmRGqZmZmqvZmZqr2Zmaq9mZmAAARMwAAETMAABExAAARMQAAERkAABEZAAARmQAAEZkV3R1RFd0dUVMREVUzFVFVM1NVNTEzMzMaMTMTmREREVUzoapVM6GqNROhqjMTqqozoaqqE6GqqqGqqqqqqoiIqvZmZqr2Zmaq9mZmqmZmZqqqmRGqqpkRqpmZEYiIiBgAABERAAAAEQAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAJmpqqqRmamqEZGZqhARkZkAEBGZAAAQEQAAABEAAAAAqqp3d6qqd3eqmnd3mpkZEZkZEQEZEQEAEQEAAAEAAAB3d3cXd3d3F3d3dxcREREBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAEBkAABCZAQAAkRkAAJEZAACRmQEAEJkZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQQQAAAAEAABAaAAChGgARqgEQSqoBoUSqAUqkGgBEpBoAABCZmQAQmZkAAJGZAACRmQAAkRkAABCqAACh3QAAod0BAAAAGQAAABkAAACZERERqqq7m6qqqputqqqaraqqmgAAoUQAEEpEAKFERBFBRES7GZFEu7mbQbu5mxu7uZu7RKQaAESqGgBEqgEARKoBAKSqAQCkGgAAqhoAABEBAAAAAKHdAACh3QAAEKoAAJEZAACRmQAAkZkAEJmZABCZma2qqpqtqqqaqqqqm6qqu5uZERERGQAAABkAAAABAAAAu7mbu7u5mxu7uZtBuxmRRBFBREQAoUREABBKRAAAoUQRAQAAqhoAAKQaAACkqgEARKoBAESqAQBEqhoARKQaAAAQmRkAkZkBAJEZAACRGQAQmQEAEBkAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBBAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAESkGgBKpBoAoUSqARBKqgEAEaoBAAChGgAAEBoAAAABAAAAAAAAAAAAAAAAAAEAABAZAAAQmQEAAJEZAACRmQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAABAAAQGgAQoRoAoaoBEUqqAapEqgEAEJkZABCZmQAQmZkAAJGZAACRGQAAEKoAAKHuAACh7gAAAAABAAAAGQAAAJkRERGqqrubqqqqm66qqpquqqqaAAAQoQAAoUoAEEpEEaFERLsZkUS7uZtBu7mbG7u5m7tEpBoARKQaAESqAQBEqgEApKoBAKQaAACqGgAAEQEAAAAAoe4AAKHuAAAQqgAAkRkAAJGZABCZmQAQmZkAEJkZrqqqmq6qqpqqqqqbqqq7m5kREREZAAAAAQAAAAAAAAC7uZu7u7mbG7u5m0G7GZFEEaFERAAQSkQAAKFKAAAQoREBAACqGgAApBoAAKSqAQBEqgEARKoBAESkGgBEpBoAAJGZAQCRGQAQmQEAEBkAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqkSqARFKqgEAoaoBABChGgAAEBoAAAABAAAAAAAAAAAAABARAADx/wAQ//8A8f8zEP8/MxD/MzMQ/zMzEP8/8wEAAAAfAAAA/wEAAP8fERHz////M///////////////AAAAEAAAAPEAABD/ERHx/////z////8z//////////8RAQAA/x8AAP//AQAz/x8AM/P/ATMz/wEzM/8BP/P/AQDx//8AEP//ABD//wAQ//8A8f//APH//xD///8Q////////////////////7/7//07u///u7v//7/7/////b2b//////////////////+/+//9O7v//7u7//+/+Zvb/////HwD//wEA//8BAP//AQD//x8A//8fAP///wH///8BEP///xD/L/IQ/yIiEP8v8hD//28A8f9vAPH/bwAQ/2//b2bub2bm7mZm5u5mZmbuZmZmZmZmZmZmZmZmZuZmZu5m9v/ubmb27m5mZu5mZmZmZmZmZmZmZmZmZmZmZm5m////AS/y/wEiIv8BL/L/Afb//wH2/x8A9v8fAPb/AQAAEP//AADx/wAAEP8AAADxAAAAEAAAAAAAAAAAAAAAAGZm7mZmbWbub93W3f/d3d3/3d/dEf3//wAR//8AABERZu5mZu5m1mbdbd323d3d/9393f///98R//8RABERAAD//wEA/x8AAP8BAAAfAAAAAQAAAAAAAAAAAAAAAAAAAAAAEBEAAPH/ABD//wDx/zMQ/z8zEP8zMxD/MzMQ/z/zAQAAAB8AAAD/AQAA/x8REfP///8z//////////////8AAAAQAAAA8QAAEP8REfH/////P////zP//////////xEBAAD/HwAA//8BADP/HwAz8/8BMzP/ATMz/wE/8/8BAPH//wAQ//8AEP//ABD//wDx//8A8f//EP///xD//////////////+/+///u7v//Tu7//+7u///v/v////9vZv/////////////v/v//7u7//07u///u7v//7/5m9v////8fAP//AQD//wEA//8BAP//HwD//x8A////Af///wEQ////EP8v8hD/IiIQ/y/yEP//bwDx/28A8f9vABD/b/9vZu5vZubuZmbm7mZmZu5mZmZmZmZmZmZmZmZm5mZm7mb2/+5uZvbubmZm7mZmZmZmZmZmZmZmZmZmZmZmbmb///8BL/L/ASIi/wEv8v8B9v//Afb/HwD2/x8A9v8BAAAQ//8AAPH/AAAQ/wAAAPEAAAAQAAAAAAAAAAAAAAAAZmbuZmZtZu5v3dbd/93d3f/d390R/f//ABH//wAAERFm7mZm7mbWZt1t3fbd3d3/3f3d////3xH//xEAEREAAP//AQD/HwAA/wEAAB8AAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAABAhAAAhIgARIiIQIiIzAAAAAAAAEBEAESEiESIiIiIiIjMiMzMzMzMzMzMzMzMAAAAAERERESIiIiIiIiIiMzMzIzMzMzMzMzMRMzMRAAAAAAAAAAAAEQEAACISAAAiEgAAEQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREAEIiIABCIiAAQiIgAEIiIABCIiAAhMhEhIjMzEREREWZmZmZVVVVVVVVVVVVVVVVVVVVVERERETMzM0QRERERZmZmZlVVVVVVVVVVVVVVVVVVVVURERERRBQAABERERFmZiYiVVUlIlVVNTNVVTUzVVUlIhERMTMAAAAAERERESIiIiIiIiIiMzMzMzMzMzMiIiIiMzOZmQAAAAARERERIiIiIiIiIiIzMzMzMzMzMyIiIiIzMzMzAAAAABEBAAAiEgAAIhIAACMSAAAjEgAAIxIAACMSAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAAAQAAAAIRAiMjMQIjMzITIzMyEyMzMiMjNDIjMzRCIzMxEyMxMRM0RERENEREREREREREREREREREREREREQURERBFERERERAEAREQBAEQUAABEFAAARAEAAEQBAABEARARFBARERAiMzMQIjMzECIzMxAiMzMQIiMiECIzMxERMzMREREzMzOZmTMzmZkzMzMzMzMzMyIiIiIzM6qqMzOqqjMzqqozMzMzMzMzMzMzMzMzMzMzIiIiIjMzMzMzMzMzMzMzMyMSAAAjEgAAIxIAACMSAAAjEgAAIxIAACMSAAAjEgAAAAAAIQAAACEAAAAhAAAQIgAAECIAABAiAAAQIgAAECIyM5GZMjORmTIzkZkzMxQRMzNEETMzREQzM0REMzNERBlBREQZQUREGUFERBFERBRBREQUREREEURERBFEREQRFBERuxQRu7sRsbu7Ebu7zLG7y8yxu8zMu8vM7LvLzO67GxExu7sbEbu7uxHMvLsbzMy7u8zMvLvuzMy77s7MuzMzMzMzMzMzISIiIhEzmZkRM5mZETGZmRsxMzMbMTMzMzMzMzMzMzMiIiIiMzMzMzMzMzMzMzMzMzMzMzMzMzMjEgAAIxIAACMSAAAjEgAAIxIAACMSAAAjEgAAIxIAAAAAECIAABAiAAAQIgAAECIAABAiAAAQIgAAACEAAAAhMzNERDMzREQzM0REMzNERDMxREQzMUREMjFDRDIxQ0REREQRREREEURERBFEREQRREREFERERBRERERERERERLvLzO67y8zuu8vM7LG7zMyxu8vM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EcHMHBERzMwREczMERHBzBERwcwRERHMEREREREREREREcHMHMHMzMzMzLvMzLy7zLy7u7y7u7sREREREREREczMERHMzMwRu8vMzLu7zMy7u7vMu7u7uxERERwREcwREczMEczMHBHMzBwRzMwREczMERHMHBERERERzBERwcwREcG8ERHMvBERzLsRwcy7EcG8uxHBvLu7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u9u7u73d67u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u9veyxwREcvMERG7zBERu8wcEbvLHBG7y8wRvbvMEb27zBERwby7Ecy7uxHMu7sRzLu7Ecy7uxHMu7sRzLu7Ecy7u9vd3b3bu7u7u7u7u7u7u7u7u7u7u7u7u6urq6urq6uru93d3bu7u9u7u7u7u7u7u7u7u7u7u7u7q6urq6urq6u7u8wRu7vLHLu7yxy7u8scu7vLHLu7yxy7u8scu7vLHBHMu7sRzLu7EcG7uxHBu7sRwby7EcG8uxERvLsREcy7u6q7uru6urq7u7q6u7u6u7u7u7u7u7u7u7u7u7u7u7uqu7qqurq6uru6uru7uru7u7u7u7u7u7u7u7u7u7u7u7u7yxy6u8scurvLEbq7yxG7u8wRu7vMEbu7HBG7yxwRqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqEREREREREREREREREREREREREREREYiIiIiIiIiIERERERERERERERERERERERERERERERERiIiIiIiIiIgRERERoaqqqqGqqqqhqqqqoaqqqqGqqqqoqqqqqKqqqhERoaqqqhERqqoREaqqRESqSkREqkpERKpKRESqqkREqqpERBERERERERERREREREREREREREREREREREQUREREEUFEERERERERERFEREREREREREREREREREREREQUREREEUEREaGqERGhqkREpKpERESqREREqkRERKpERKSqd3ekqqqqSkSqqkpEqqpERKqqRESqqkREqqpERKqqRESqqkRERBRERERERERERERERERERERERDNERDMTRDQzEUQ0MxNERBREREREREREREREREREM0NERBEzQ0QRMTNEETMzRHd3qqp3d6qqdESkqnREpKp0RKSqdESkqnREpKpERKSqqqpERKqqRESqqkpEqqpKRKqqqkSqqqpEqqqqSqqqqqpEMzMzRDMzM0QzMzNENBMzRDQzEUREMzNEREQzRERERDMzM0MzMzNDMzMzQzMTM0QRMTNEMzNDRDNDRERERERERESkqkREpKpERKqqRESqqkSkqqpEpKqqRKqqqqSqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoRERERERERERERERERERERERERERERiIiIiIiIiIgRERERERERERERERERERERERERERERERGIiIiIiIiIiBERERGhqqqqoaqqqqGqqqqhqqqqoaqqqqiqqqqoqqqqERGhqqqqERGqqhERqqpERKpKRESqSkREqkpERKqqRESqqkREERERERERERFERERERERERERERERERERERBFBREQRQUQREREREREREURERERERERERERERERERERERBFBREQRQRERoaoREaGqRESkqkRERKpERESqREREqkREpKp3d6SqqqpKRKqqSkSqqkREqqpERKqqRESqqkREqqpERKqqREREREREREREREREREREREREREREM0REMxNENDMRRDQzE0REREREREREREREREREREQzQ0REETNDRBExM0QRMzNEd3eqqnd3qqp0RKSqdESkqnREpKp0RKSqdESkqkREpKqqqkREqqpERKqqSkSqqkpEqqqqRKqqqkSqqqpKqqqqqkQzMzNEMzMzRDMzM0Q0EzNENDMRREQzM0RERDNEREREMzMzQzMzM0MzMzNDMxMzRBExM0QzM0NEM0NERERERERERKSqRESkqkREqqpERKqqRKSqqkSkqqpEqqqqpKqqqgBoW0RCT05LIQAAAFRPWSBIQU1NRVIAAFNUQUdFIDEtMQAAAFNDAAAtAAAASEkAAFNUAABQV1IATFYAACQAAABTTAAAQk9TUwAAAABOSUdIVCBFTkdJTkUAAAAAR0FURSBXQVJERU4AQklHIFRFRERZAAAASVJPTiBNT1RIAAAATU9PTiBTQU5ETUFOAAAAAFBIQVNFIDIARklOQUwgUEhBU0UALSBQQVVTRUQgLQAAU0VFRAAAAABSQU5LAAAAAFJFTElDUwAATk9ORSBZRVQgLSBCRUFUIEJPU1NFUwAAU1RBUlQ6UkVTVU1FIFNFTEVDVDpRVUlUAAAAAFdBUk5JTkchAAAAAFNVQi1MRVZFTCBDTEVBUiEAAAAAVFdJTElHSFQgT1JCSVQAAElST04gSElWRQAAAFBJTExPVyBDTE9VRFMAAABCTEFDSyBGT1VORFJZAAAAQ0FORFkgTU9PTgAAPgAAAD8/PyBMT0NLRUQgPz8/AABVTkxPQ0sgSU4gVEhFIERSRUFNIFdPUktTSE9QIEZPUiAxMjAgRFJFQU0gQ09JTlMuAAAAU1BFRUQAAABTSE9UAAAAAFBPV0VSAAAAUkFURQAAAAA+IFlFUwAAACAgWUVTAAAAPiBOTwAAAAAgIE5PAAAAAENPSU5TAAAAUkVMAFRIRSBQSUxMT1cgTUFSS0VUAAAAJ0NPSU5TIEZPUiBDT01GT1JULCBMSVRUTEUgUElMT1QuIEVWRVJZVEhJTkcgSEVSRSBXQVMgT05DRSBTT01FQk9EWSdTIERSRUFNLicAAABMRUFWRSAgKFRPIE5FWFQgU1RBR0UpAABTT0xEAAAAAD4gT1BFTiBJVAAAAEE6IE9OV0FSRAAAAEJPU1M6IElST04gTU9USABCT1NTOiBOSUdIVCBFTkdJTkUAAEJPU1M6IEJJRyBURUREWQBCT1NTOiBNT09OIFNBTkRNQU4AAFJPVVRFIEZPUksAAENIT09TRSBZT1VSIFBBVEgAAAAAMS0AAE5JR0hUTUFSRSBST1VURQBHUklNLiBPUkIgU1RPUk1TLgAAAERSRUFNIFJPVVRFAFNJTExZLiBTVEFSUyEAAABVUC9ET1dOIENIT09TRSAgIEE6RkxZAABEUkVBTSBXT1JLU0hPUAAARFJFQU0gQ09JTlMAKwAAAERPTkUAAAAAT1dORUQAAABNQVgAREMAAEJBQ0sgVE8gVEhFIFRJVExFIFNDUkVFTi4AAABSVU5TAAAAAENMRUFSUwAAfiBBIERSRUFNIFdBUiB+AEEgVFJJQlVURSBUTyBHUkFESVVTIFJBSURFTgBNQURFIEZPUiBHSVRIVUIgR0FNRSBPRkYgMjAyNgAAAEEgR0FNRSBERVZFTE9QRUQgQU5EIENSRUFURUQAAAAAQlkgWkFDSEFSWSBQRUVCTEVTAABERUJVRwAAAFBSRVNTIFNUQVJUACAgICAgICAgICAgAERQQUQ6TU9WRSBBOkZJUkUgQjpCT01CIEw6Q0FTSAAAU0VMRUNUIERJRkZJQ1VMVFkAAABBOk9LICBCOkJBQ0sAAAAAICAgICAgICAAAAAAU0VMRUNUIFlPVVIgU0hJUAAAAAA8PiBDSE9PU0UgICBBOk9LICAgQjpCQUNLAAAAICAgICAgAABMT0NLRUQAAFBPV0VSIE1FVEVSOiBQSUNLIFNMT1QgMQAAAABTTE9UIDEgSVMgWU9VUlMuIFRIRSBPVEhFUiA2IFNMT1RTIEFSRSBST0xMRUQgRlJFU0ggRVZFUlkgUlVOLiBDQVBTVUxFUyBNT1ZFIFRIRSBMSUdIVCwgTCBDQVNIRVMgSU4uAAAAACAgICAgICAgIAAAACA/IABXT1JMRCAxICAtICBUSEUgRFJFQU0gV0FSAAAAQUxSRUFEWSBTT0xELiAgICAgICAgICAATk9UIEVOT1VHSCBDT0lOUy4gICAgICAgAAAAAFNISUVMRCBVUCEAAEJPTUIgU1RPQ0tFRCEAAABNRVRFUiArMiEAAABSRUxJQzogAE1FVEVSIFJFUk9MTEVEIQBPUFRJT04gT1JCIEpPSU5TIFlPVSEAAABUSFJFRSBDQVBTVUxFUyBBTkQgQSBIQU5ERlVMIE9GIENPSU5TIQAAWU9VIEZMWSBPTiBXSVRIT1VUIEEgV09SRC4AACdOTyBTSElFTEQgVE8gVFJBREU/IFBJVFkuJyBUSEUgVEVERFkgVElQUyBISVMgSEFULgBERUFMISBSRUxJQzogAAAAVEhFIFNIQURPVyBMQVVHSFMgQVQgWU9VUiBFTVBUWSBQT0NLRVRTLgAAAABUSEUgTU9PTiBDQVJEISBZT1VSIEJFVCBJUyBUUklQTEVELgBBIFNLVUxMIENBUkQuIFRIRSBTSEFET1cgVEFLRVMgWU9VUiBCRVQuAAAAAEdBTUUgT1ZFUgAAAFNDT1JFAAAARFJFQU0AAABXT1JMRCAxIENMRUFSAAAALSBUTyBCRSBDT05USU5VRUQgLQBUSEUgTklHSFRNQVJFIFBVTExTIEJBQ0sgSU5UTyBUSEUgREFSSy4uLiBGT1IgTk9XLiBNSUxPIFRVUk5TIE9WRVIgSU4gSElTIFNMRUVQIEFORCBTTUlMRVMuAFRPQVNULVIgVU5MT0NLRUQhIChTQVZFRCkAAABVUEdSQURFIEJPVUdIVCEgKFNBVkVEKQBBTFJFQURZIE1BWEVEAAAATk9UIEVOT1VHSCBEUkVBTSBDT0lOUwAAQSBURUREWSBJTiBBIFRPUCBIQVQgQk9XUy4gJ1RSQURFIE9ORSBTSElFTEQgRk9SIEEgUkVMSUMsIExJVFRMRSBQSUxPVD8nAAAAAEEgU0hBRE9XIFNIVUZGTEVTIFRIUkVFIENBUkRTLiAnQkVUIEhBTEYgWU9VUiBDT0lOUy4gRklORCBUSEUgTU9PTiBDQVJEIEFORCBJIFRSSVBMRSBUSEVNLicAQSBMT1NUIFRPWSBCT1ggRFJJRlRTIE9VVCBPRiBUSEUgQ0xPVURTLiBTT01FVEhJTkcgSU5TSURFIElTIFJBVFRMSU5HLgAAVEhFIERSRUFNIE1FUkNIQU5UAABUSEUgTklHSFRNQVJFIEdBTUJMRQAAAABBIExPU1QgVE9ZIEJPWAAAKiAgICAAAAAqKiAgIAAAACoqKiAgAAAAKioqKiAAAAAqKioqKgAAAFNUQVJUIFJVTgAAAEdBTUUgU0VUVElOR1MAAABTVEFSVCBCT01CICsxAAAAQkVHSU4gRVZFUlkgUlVOIFdJVEggQU4gRVhUUkEgQk9NQi4AU1RBUlQgU0hJRUxEICsxAEJFR0lOIEVWRVJZIFJVTiBXSVRIIEFOIEVYVFJBIFNISUVMRC4AAABDQVBTVUxFIExVQ0sAAAAARU5FTUlFUyBEUk9QIENBUFNVTEVTIE1PUkUgT0ZURU4uAAAAVU5MT0NLIFRPQVNULVIAAEEgNFRIIFNISVA6IEEgQlJBVkUgVE9BU1RFUiBXSVRIIFRXSU4gVE9BU1QuAAAAAFNISUVMRCArMQAAAEJPTUIgKzEAQ0FQU1VMRSBYMgAATVlTVEVSWSBSRUxJQwAAAFJFUk9MTCBNRVRFUgAAAABPUFRJT04gT1JCAABNSUxPAAAAAExJR0hUUyBPVVQgV0FTIEFUIE5JTkUuIEJVVCBFVkVSWSBOSUdIVCBUSEUgV0FSIElOIE1ZIEhFQUQgU1RBUlRTIFJJR0hUIE9OIFRJTUUuAAAAAEkgRFJFQU1FRCBVUCBBIFNRVUFEUk9OIFRPIEdVQVJEIE1ZIFNMRUVQLiBKRVRTLCBQQVBFUiBQTEFORVMuLi4gRVZFTiBBIFBFTkdVSU4uAAAAAD8/PwBMSVRUTEUgUElMT1QuIFlPVVIgRFJFQU1TIEJFTE9ORyBUTyBUSEUgTklHSFQgTk9XLiBFVkVSWSBUT1kuIEVWRVJZIFNUQVIuAAAATk9UIFRPTklHSFQsIE5JR0hUTUFSRS4gRFJFQU0gU1FVQURST04uLi4gTEFVTkNIIQAAAEVBU1ksIEJVVCBBIExJVFRMRSBDSEFMTEVOR0lORy4gU0xPV0VSIEJVTExFVFMsIDMgU0hJRUxEUy4AAFBFUkZFQ1RMWSBOT1JNQUwuIFRIRSBXQVkgVEhFIERSRUFNIFdBUyBNRUFOVCBUTyBCRS4gMiBTSElFTERTLgBBIE5PVENIIEFCT1ZFIE5PUk1BTC4gRkFTVEVSLCBERU5TRVIgRklSRS4gMSBTSElFTEQuAAAAAEFEQVBUSVZFIEFORCBST1VHSC4gUExBWSBXRUxMIEFORCBUSEUgU1RPUk0gR1JPV1MgV0lMREVSLgAAAERPRE9OUEFDSEkgUi1UWVBFIFBBUk9ESVVTAABFQVNZAAAAAE5PUk1BTAAASEFSRAAAAABFWFRSRU1FAEZJUkUgUkFURSBVUAAAAABTSE9UIERBTUFHRSArMQAATU9SRSBDQVBTVUxFUwAAAFNQRUVEIFVQAAAAAENPSU5TIFgyAAAAAEVORU1ZIFNIT1RTIC0xMiUAAAAAQk9NQlMgKzIAAAAASVJPTiBIRUFSVAAAUVVJQ0sgVFJJR0dFUgAAAFNUQVIgTEVOUwAAAExVQ0tZIERJRQAAAEZFQVRIRVIAQ09JTiBDSEFSTQAAU0xPVyBDTE9DSwAAQk9NQiBTQVRDSEVMAAAAAE1PVkUgRkFTVEVSIChYNCkAAAAAR1JPVU5EIE1JU1NJTEVTIChYMikAAAAARVhUUkEgVVAtQU5HTEUgU0hPVABQSUVSQ0lORyBCRUFNAAAAVFJBSUxJTkcgT1JCIENPUElFUyBZT1UgKFgyKQAAAAArMiBTSElFTEQgSElUUwAAV0lERSBQSUVSQ0lORyBSSU5HUwA1LVdBWSBGQU4AAABNSVNTSUxFUyBTRUVLIEZPRVMAAE9ORSBNT1JFIEJPTUIAAABTTE9XIEJVTExFVFMgMTAgU0VDAERPVUJMRSBTQ09SRSAxNSBTRUMAUFVMTCBJTiBDT0lOUytDQVBTVUxFUwAAQk9OSyEgQlVMTEVUUyBUTyBDT0lOUwAARkFTVEVSIEZJUkUgKFgyKQAAAABNSVNTSUxFAERPVUJMRQAATEFTRVIAAABPUFRJT04AAFNISUVMRAAAUklQUExFAABTUFJFQUQAAEhPTUlORwAAU0xPVy1NTwBTQ09SRSBYMgAAAABNQUdORVQAAFJBUElEAAAAU1BEAE1TTABEQkwATFNSAE9QVABTSEQAUklQAFNQUgBIT00AQk0rAFNMTwBYMiAATUFHAEhBTQBSQVAATlgtNyBOSUdIVEpFVAAAAEJBTEFOQ0VEIFdBUiBKRVQuIEZBU1QgREFTSCBTSE9UUy4AAERBU0gAAAAAUEFQRVIgRFJFQU0AQSBGT0xERUQgU0NIT09MIFBMQU5FLiBRVUlDSywgMy1XQVkuAAAAADMtV0FZAAAAU0dULiBXQURETEVTAAAAAEJBVFRMRSBQRU5HVUlOLiBTTE9XLiBIRUFWWSBGSVNILgAAAEZJU0gAAAAAVE9BU1QtUgBBIEJSQVZFIFRPQVNURVIuIFRXSU4gVE9BU1QgVk9MTEVZLgBUV0lOAAAAAERTAABEUytQU0cAAFBTRwBTRlgAQUxMAE9GRgBNSVgARFJJVkVSAABEUyBQQVRIAExJVkUAAAAAUFJFVklFVwBWSURFTwAAAFJFTkRFUgAAUkVTRVQgUEFHRQAAUkVTRVQgQUxMAAAAXgAAAHYAAABQUkVTUyBBIEFHQUlOIFRPIENPTkZJUk0gVEhFIFJFU0VULiBBTlkgT1RIRVIgS0VZIENBTkNFTFMuAABCQUNLIFRPIFRJVExFAAAAQVVESU8AAABHQU1FUExBWQAAAAA8AAAAREVGQVVMVFMgUkVTVE9SRUQgQU5EIFNBVkVELgAAAABSRVNUT1JFIEVWRVJZIFNFVFRJTkcgVE8gREVGQVVMVFMgKFBSRVNTIEEgVFdJQ0UpLgAAQVVUTy1GSVJFLCBCVVRUT04gTEFZT1VUIEFORCBIVUQgTEFZT1VULgAAAABBVURJTyBEUklWRVIsIFNBTVBMRSBSQVRFLCBCSVQgREVQVEgsIExBVEVOQ1ksIFNURVJFTywgVE9ORS4AAAAAU0hBREVSUywgU0NBTkxJTkVTLCBNT1NBSUMsIEJMRU5ELCBBU1BFQ1QsIEZQUy4AU0VUVElOR1MgQVBQTFkgSU5TVEFOVExZIEFORCBTQVZFIFRPIFRIRSBDQVJUUklER0UuAFJFU1RPUkUgVEhJUyBQQUdFIFRPIElUUyBERUZBVUxUUyAoUFJFU1MgQSBUV0lDRSkuAABNQUlOAAAAAFJFTkRFUiBNT0RFAEhBUkRXQVJFLCBURU1QT1JBTCBESVRIRVIsIExJTkUgRE9VQkxFIE9SIElOVEVSTEFDRS4AAAAAU0hBREVSAABSRUFMLVRJTUUgUEFMRVRURSBTSEFERVIgT04gRVZFUlkgQkcgQU5EIFNQUklURSBDT0xPUi4AAFNDQU5MSU5FUwAAAERBUktFTlMgRVZFUlkgT1RIRVIgTElORSBWSUEgSEJMQU5LIERNQS4gTk8gQ1BVIENPU1QuAAAAUkVTT0xVVElPTgAASEFSRFdBUkUgTU9TQUlDIExPV0VSUyBQSVhFTCBSRVNPTFVUSU9OLiBIVUQgU1RBWVMgU0hBUlAuAAAAQlJJR0hUTkVTUwAAR0FNTUEgQ1VSVkUgT04gQUxMIFBBTEVUVEVTLiAwIElTIFRIRSBPUklHSU5BTCBMT09LLgAAAABTQVRVUkFUSU9OAABDT0xPUiBTQVRVUkFUSU9OLiAwJSBJUyBHUkFZU0NBTEUsIDEwMCUgSVMgT1JJR0lOQUwuAAAAAEZSQU1FIEJMRU5EAExDRCBHSE9TVElORzogQUxQSEEtQkxFTkRFRCBUUkFJTFMgQkVISU5EIE1PVklORyBTUFJJVEVTLgAAAFNDUkVFTiBTSEFLRQAAAABTSEFLRVMgVEhFIFBMQVlGSUVMRCBPTiBCT01CUywgSElUUyBBTkQgQklHIEVYUExPU0lPTlMuAFNDUkVFTiBGTEFTSAAAAABXSElURSBGTEFTSCBPTiBCT01CUyBBTkQgQk9TUyBLSUxMUy4gU09GVC9PRkYgRk9SIENPTUZPUlQuAABGUkFNRSBSQVRFAAA2MCBFVkVSWSBGUkFNRSwgMzAgSEFMRiBSQVRFLCBBREFQVElWRSBTS0lQUyBJRiBCVVNZLgAAAEFTUEVDVAAATUFTS1MgVEhFIFBMQVlGSUVMRCBFREdFUyBJTiBHQU1FUExBWS4gSFVEIFNUQVlTIFZJU0lCTEUuAAAAQlVMTEVUUwBSRUNPTE9SUyBFTkVNWSBCVUxMRVRTIChTSEFERVItUFJPT0YpIFNPIFRIRVkgUE9QLgAAUEVSRiBNRVRFUgAAU0hPV1MgRlJBTUVTIFBFUiBTRUNPTkQgQU5EL09SIENQVSBMT0FEIElOIFRIRSBDT1JORVIuAABBVURJTyBEUklWRVIAAAAARFMrUFNHOiBDSElQIE1VU0lDICsgU0FNUExFRCBTRlguIERTIE9OTFk6IFNPRlRXQVJFIFNZTlRILgAAU0FNUExFIFJBVEUARFMgTUlYRVIgUkFURSAoU0ZYOyBNVVNJQyBUT08gSU4gRFMgT05MWSkuIEhJR0ggPSBDTEVBTkVSLgAAQklUIERFUFRIAAAAQklULUNSVVNIRVMgRElSRUNUU09VTkQgKFNGWDsgTVVTSUMgVE9PIElOIERTIE9OTFkpLgAAAABMQVRFTkNZAE1JWC1BSEVBRCBCVUZGRVI6IDEsIDIgT1IgMyBGUkFNRVMgKDE3IC8gMzMgLyA1MCBNUykuAAAAQVVESU8gU1lOQwAAV0hBVCBTV0FQUyBNSVggQlVGRkVSUzogVkJMQU5LIElSUSwgVElNRVIxIElSUSwgRlJFRSBSSU5HLgAAU1RFUkVPAABQQU5TIE1VU0lDIFZPSUNFUyArIFNGWC4gV0lERSBBRERTIEEgU0lERS1DSEFOTkVMIEJPT1NULgAAAABUT05FAAAAAE1JWEVSIEZJTFRFUiBCUklHSFQuLk1VRkZMRUQgKE1VU0lDIFRPTyBJTiBEUyBPTkxZKS4AAAAATVVTSUMgVk9MVU1FAAAAAE1VU0lDIExFVkVMLCAwIFRPIDEwLgAAAFNGWCBWT0xVTUUAAFNPVU5EIEVGRkVDVCBMRVZFTCwgMCBUTyAxMC4AAAAATVVTSUMgU1RZTEUAQVVUTyBGT0xMT1dTIFlPVVIgUk9VVEUsIE9SIExPQ0sgRFJFQU0gLyBOSUdIVE1BUkUuAEFVVE8tRklSRQAAAE9GRjogSE9MRCBUTyBGSVJFLiBUT0dHTEU6IFRBUCBPTi9PRkYuIEFMV0FZUzogTk9OU1RPUC4AQlVUVE9OUwBTV0FQIFRIRSBGSVJFIEFORCBCT01CIEJVVFRPTlMgSU4gU1RBR0VTLgAAAEhVRCBMQVlPVVQAAEZVTEwgVFdPLUxJTkUgSFVEIE9SIEEgTUlOSU1BTCBPTkUtTElORSBIVUQuAAAAAEZVTEwAAAAATUlOSU1BTABBIEZJUkUgQiBCTUIAAAAAQiBGSVJFIEEgQk1C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3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiEhISEhId/f39/f39/f39/f39/f398hISEhISEhISEhISEhISHf39/f39/f39/f39/f398hISEhISEhISEhISEhISHg4ODg4ODg4ODg4ODg4OAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODgICAgICAgICAgICAgICAg4ODg4ODg4eHh4eHh4eHhHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eLi4h4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4eHh7i4uLi4uLi4uLi4uLi4uIeHh4dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+PjHR0dHR0dHR0dHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwcG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxvl5eXl5ebm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXF+np6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfq6urq6urq6urq6urq6uoWFhYWFhYWFhYWFhYWFhYW6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYW6urq6urq6+vr6+vr6+vrFRUVFRUVFRUVFRUVFRUV6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+zs7BQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7OwUFBMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e0TExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3tExMTExMTExMSEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBDw8PDw8PDw8CgoKCgoKCgoKCgoKCgoKCgoKCgoKNjY2NjY2NjY2NjY2NjZ2dnZ2dnZJycnJycnJycnJycnJycnJycnJyfZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dknJycnJycnJycnJycnJycnJycnJtra2tra2tra2tra2tra2tra2traJiYmJiYmJiYmJiYmJiYmJiYmJiba2tra2tra2tra2tra2tra2tra2tomJiYmJiUlJSUlJSUlJSUlJSUlJdvb29vb29vb29vb29vb29vb29vbJSUlJSUlJSUlJSUlJSUlJSUlJSXb29vb29vb29vb29vc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCQkJCQkJNzc3Nzc3Nzc3Nzc3Nzc3Nzc3NzcJCQkJCQkJCQkJCQkJCQkJCQjIyMj3d3d3d3d3d3d3d3d3d3d3d3d3d0jIyMjIyMjIyMjIyMjIyMjIyMjI93d3d3d3d3d3d3d3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIiIiIiIi3t7e3t7e3t7e3t7e3t7e3t7e3t4iIiIiIiIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t/f39/f39/f39/fISEhISEhISEhISEhISEhISEhISEh39/f39/f39/f39/f39/f39/f398hISEhISEhISEhISEhISEgICAgIODg4ODg4ODg4ODg4ODg4ODg4ODg4CAgICAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODg4ODg4OAgHx8fHx8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eLi4uLi4uLi4uLi4uIeHh4eHh4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4dHR0dHR0d4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj5BwcHBwcHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTk5OTk5OQcHBwcHBwcHBwcHBwcHBwcHBwcHBzk5OTk5eXl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxsbGxsb5eXl5eXl5eXl5eXl5eXl5eXl5eUbGxsbGxsbGxsbGxoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5ubm5ubm5hoaGhoaGhoaGhoaGhoaGhoaGhoa5ubm5ubm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZGRkZGRnn5+fn5+fn5+fn5+fn5+fn5+fn5xkZGRkZGRkZGRkZGRkZGRkZGRkZ5+fn6Ojo6Ojo6Ojo6Ojo6Ojo6OjoGBgYGBgYGBgYGBgYGBgYGBgYGBjo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXFxcXFxcX6enp6enp6enp6enp6enp6enp6enpFxcXFxcXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6enq6urq6hYWFhYWFhYWFhYWFhYWFhYWFhYWFurq6urq6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYWFhYWFhbq6+vr6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+vr6+vr6+vrFRUVFRUVFRQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7O3t7e3t7e3tExMTExMTExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3t7e3t7RMTExMTExMTExMTExMTExMTExMSEu7u7u7u7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEhISEhLu7u7u7u7u7u7u7u7u7u7u7u7u7u4SEhISEREREREREREREREREREREe/v7+/v7+/v7+/v7+/v7+/v7+/vERERERERERERERERERERERERERHv7+/v7+/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBAQEBAQEPDw8CgoKCgoKCgoKCgoKCgoKCjY2NjY2NjY2NjY2NjY2NgoKCgnJycnJycnJycnJyfZ2dnZ2dnZ2dnZ2dnZ2dknJycnJycnJycnJycnJycn2dnZ2dnZ2dnZ2dnZ2dnZJycnJycnJycnJiYmJiYm2tra2tra2tra2tra2traJiYmJiYmJiYmJiYmJiYm2tra2tra2tra2tra2tra2iYmJiYmJiYmJiYmJiYmJtvb29vb29vb29vb29vb2yUlJSUlJSUlJSUlJSUlJdvb29vb29vb29vb29vb2yUlJSUlJSUlJSUlJSUlJSXb29vb29vc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCTc3Nzc3Nzc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCTc3Nzc3Nzc3Nzc3Nzd3d3dIyMjIyMjIyMjIyMjIyMj3d3d3d3d3d3d3d3d3d3dIyMjIyMjIyMjIyMjIyMj3d3d3d3d3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiEhISEhId/f39/f39/f39/f39/f398hISEhISEhISEhISEhISHf39/f39/f39/f39/f398hISEhISEhISEhISEhISHg4ODg4ODg4ODg4ODg4OAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODgICAgICAgICAgICAgICAg4ODg4ODg4eHh4eHh4eHhHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eLi4h4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4eHh7i4uLi4uLi4uLi4uLi4uIeHh4dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+PjHR0dHR0dHR0dHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwcG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxvl5eXl5ebm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXF+np6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfq6urq6urq6urq6urq6uoWFhYWFhYWFhYWFhYWFhYW6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYW6urq6urq6+vr6+vr6+vrFRUVFRUVFRUVFRUVFRUV6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+zs7BQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7OwUFBMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e0TExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3tExMTExMTExMSEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBDw8PDw8PDw8CgoKCgoKCgoKCgoKCgoKCgoKCgoKNjY2NjY2NjY2NjY2NjZ2dnZ2dnZJycnJycnJycnJycnJycnJycnJyfZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dknJycnJycnJycnJycnJycnJycnJtra2tra2tra2tra2tra2tra2traJiYmJiYmJiYmJiYmJiYmJiYmJiba2tra2tra2tra2tra2tra2tra2tomJiYmJiUlJSUlJSUlJSUlJSUlJdvb29vb29vb29vb29vb29vb29vbJSUlJSUlJSUlJSUlJSUlJSUlJSXb29vb29vb29vb29vc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCQkJCQkJNzc3Nzc3Nzc3Nzc3Nzc3Nzc3NzcJCQkJCQkJCQkJCQkJCQkJCQjIyMj3d3d3d3d3d3d3d3d3d3d3d3d3d0jIyMjIyMjIyMjIyMjIyMjIyMjI93d3d3d3d3d3d3d3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIiIiIiIi3t7e3t7e3t7e3t7e3t7e3t7e3t4iIiIiIiIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t/f39/f39/f39/fISEhISEhISEhISEhISEhISEhISEh39/f39/f39/f39/f39/f39/f398hISEhISEhISEhISEhISEgICAgIODg4ODg4ODg4ODg4ODg4ODg4ODg4CAgICAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODg4ODg4OAgHx8fHx8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eLi4uLi4uLi4uLi4uIeHh4eHh4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4dHR0dHR0d4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj5BwcHBwcHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTk5OTk5OQcHBwcHBwcHBwcHBwcHBwcHBwcHBzk5OTk5eXl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxsbGxsb5eXl5eXl5eXl5eXl5eXl5eXl5eUbGxsbGxsbGxsbGxoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5ubm5ubm5hoaGhoaGhoaGhoaGhoaGhoaGhoa5ubm5ubm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZGRkZGRnn5+fn5+fn5+fn5+fn5+fn5+fn5xkZGRkZGRkZGRkZGRkZGRkZGRkZ5+fn6Ojo6Ojo6Ojo6Ojo6Ojo6OjoGBgYGBgYGBgYGBgYGBgYGBgYGBjo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXFxcXFxcX6enp6enp6enp6enp6enp6enp6enpFxcXFxcXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6enq6urq6hYWFhYWFhYWFhYWFhYWFhYWFhYWFurq6urq6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYWFhYWFhbq6+vr6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+vr6+vr6+vrFRUVFRUVFRQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7O3t7e3t7e3tExMTExMTExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3t7e3t7RMTExMTExMTExMTExMTExMTExMSEu7u7u7u7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEhISEhLu7u7u7u7u7u7u7u7u7u7u7u7u7u4SEhISEREREREREREREREREREREe/v7+/v7+/v7+/v7+/v7+/v7+/vERERERERERERERERERERERERERHv7+/v7+/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBAQEBAQEPDw8CgoKCgoKCgoKCgoKCgoKCjY2NjY2NjY2NjY2NjY2NgoKCgnJycnJycnJycnJyfZ2dnZ2dnZ2dnZ2dnZ2dknJycnJycnJycnJycnJycn2dnZ2dnZ2dnZ2dnZ2dnZJycnJycnJycnJiYmJiYm2tra2tra2tra2tra2traJiYmJiYmJiYmJiYmJiYm2tra2tra2tra2tra2tra2iYmJiYmJiYmJiYmJiYmJtvb29vb29vb29vb29vb2yUlJSUlJSUlJSUlJSUlJdvb29vb29vb29vb29vb2yUlJSUlJSUlJSUlJSUlJSXb29vb29vc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCTc3Nzc3Nzc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCTc3Nzc3Nzc3Nzc3Nzd3d3dIyMjIyMjIyMjIyMjIyMj3d3d3d3d3d3d3d3d3d3dIyMjIyMjIyMjIyMjIyMj3d3d3d3d3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t7e3t7e3iIiIiIiIiIiIiEhISEhId/f39/f39/f39/f39/f398hISEhISEhISEhISEhISHf39/f39/f39/f39/f398hISEhISEhISEhISEhISHg4ODg4ODg4ODg4ODg4OAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODgICAgICAgICAgICAgICAg4ODg4ODg4eHh4eHh4eHhHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eLi4h4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4eHh7i4uLi4uLi4uLi4uLi4uIeHh4dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+PjHR0dHR0dHR0dHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTkHBwcHBwcHBwcHBwcHBwcG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbG+Xl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxvl5eXl5ebm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5uYaGhoaGhoaGhoaGhoaGhrm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGRkZGRkZGRkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBgYGBgYGOjo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXF+np6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6ekXFxcXFxcXFxcXFxcXFxfq6urq6urq6urq6urq6uoWFhYWFhYWFhYWFhYWFhYW6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYW6urq6urq6+vr6+vr6+vrFRUVFRUVFRUVFRUVFRUV6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+zs7BQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7OwUFBMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e0TExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3tExMTExMTExMSEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhIS7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7+/v7+/v7+/v7xEREREREREREREREREREe/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBDw8PDw8PDw8CgoKCgoKCgoKCgoKCgoKCgoKCgoKNjY2NjY2NjY2NjY2NjZ2dnZ2dnZJycnJycnJycnJycnJycnJycnJyfZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dknJycnJycnJycnJycnJycnJycnJtra2tra2tra2tra2tra2tra2traJiYmJiYmJiYmJiYmJiYmJiYmJiba2tra2tra2tra2tra2tra2tra2tomJiYmJiUlJSUlJSUlJSUlJSUlJdvb29vb29vb29vb29vb29vb29vbJSUlJSUlJSUlJSUlJSUlJSUlJSXb29vb29vb29vb29vc3Nzc3Nzc3NwkJCQkJCQkJCQkJCQkJCQkJCQkJNzc3Nzc3Nzc3Nzc3Nzc3Nzc3NzcJCQkJCQkJCQkJCQkJCQkJCQjIyMj3d3d3d3d3d3d3d3d3d3d3d3d3d0jIyMjIyMjIyMjIyMjIyMjIyMjI93d3d3d3d3d3d3d3d3d3d3d3d3dIyMjIiIiIiIiIiIiIiIiIiIiIiIi3t7e3t7e3t7e3t7e3t7e3t7e3t4iIiIiIiIiIiIiIiIiIiIiIiIiIt7e3t7e3t7e3t/f39/f39/f39/fISEhISEhISEhISEhISEhISEhISEh39/f39/f39/f39/f39/f39/f398hISEhISEhISEhISEhISEgICAgIODg4ODg4ODg4ODg4ODg4ODg4ODg4CAgICAgICAgICAgICAgICAgICAg4ODg4ODg4ODg4ODg4ODg4ODg4OAgHx8fHx8fHx8fHx8fHx8fHx8fH+Hh4eHh4eHh4eHh4eHh4eHh4eHh4R8fHx8fHx8fHx8fHx8fHx8fHx8f4eHh4eHh4eLi4uLi4uLi4uLi4uIeHh4eHh4eHh4eHh4eHh4eHh4eHuLi4uLi4uLi4uLi4uLi4uLi4uLi4h4eHh4eHh4eHh4eHh4dHR0dHR0d4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+MdHR0dHR0dHR0dHR0dHR0dHR0dHR3j4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj5BwcHBwcHBwcHBwcHBwcHBwcHBwc5OTk5OTk5OTk5OTk5OTk5OTk5OQcHBwcHBwcHBwcHBwcHBwcHBwcHBzk5OTk5eXl5eXl5eXl5eXl5eXl5RsbGxsbGxsbGxsbGxsbGxsbGxsb5eXl5eXl5eXl5eXl5eXl5eXl5eUbGxsbGxsbGxsbGxoaGhoaGhoaGhrm5ubm5ubm5ubm5ubm5ubm5ubm5hoaGhoaGhoaGhoaGhoaGhoaGhoa5ubm5ubm5ubm5ubm5ubm5ubn5+fnGRkZGRkZGRkZGRkZGRkZGRkZGRnn5+fn5+fn5+fn5+fn5+fn5+fn5xkZGRkZGRkZGRkZGRkZGRkZGRkZ5+fn6Ojo6Ojo6Ojo6Ojo6Ojo6OjoGBgYGBgYGBgYGBgYGBgYGBgYGBjo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6BgYGBgYGBgYGBcXFxcXFxcXFxcX6enp6enp6enp6enp6enp6enp6enpFxcXFxcXFxcXFxcXFxcXFxcXFxfp6enp6enp6enp6enp6enq6urq6hYWFhYWFhYWFhYWFhYWFhYWFhYWFurq6urq6urq6urq6urq6urq6urqFhYWFhYWFhYWFhYWFhYWFhYWFhbq6+vr6+vr6+vr6+vr6+vr6+vr6xUVFRUVFRUVFRUVFRUVFRUVFRUVFevr6+vr6+vr6+vr6+vr6+vr6+vrFRUVFRUVFRQUFBQUFBQUFBQUFBTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7BQUFBQUFBQUFBQUFBQUFBQUFBQUFOzs7Ozs7Ozs7Ozs7O3t7e3t7e3tExMTExMTExMTExMTExMTExMTExPt7e3t7e3t7e3t7e3t7e3t7e3t7RMTExMTExMTExMTExMTExMTExMSEu7u7u7u7u7u7u7u7u7u7u7u7u7uEhISEhISEhISEhISEhISEhISEhLu7u7u7u7u7u7u7u7u7u7u7u7u7u4SEhISEREREREREREREREREREREe/v7+/v7+/v7+/v7+/v7+/v7+/vERERERERERERERERERERERERERHv7+/v7+/v7+/v7/Dw8PDw8PDw8PAQEBAQEBAQEBAQEBAQEBAQEBAQEPDw8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4eHh7i4uIeHh4e4uLiHh0d4+Pj4x0dHePj4+MdHR3j4+MdHR0d4+PjHR0dHeTk5BwcHOTk5OQcHBzk5OQcHBwc5OTkHBwcHOTk5BsbG+Xl5eUbGxvl5eXlGxsb5eXlGxsbG+Xl5RsbG+bm5uYaGhrm5ubmGhoa5ubmGhoaGubm5hoaGhrm5+cZGRnn5+fnGRkZ5+fnGRkZGefn5xkZGRnn5+cZGBjo6OjoGBgY6Ojo6BgYGOjo6BgYGBjo6OgYGBjo6enpFxcX6enp6RcXF+np6RcXFxfp6ekXFxcX6enqFhYW6urq6hYWFurq6hYWFhbq6uoWFhYW6urqFhYV6+vr6xUVFevr6+sVFRXr6+sVFRUV6+vrFRUV6+vs7BQUFOzs7OwUFBTs7OwUFBQU7OzsFBQUFOzs7BQTE+3t7e0TExPt7e0TExMT7e3tExMTE+3t7RMTE+7u7u4SEhLu7u7uEhIS7u7uEhISEu7u7hISEhLu7u8RERHv7+/vERER7+/vEREREe/v7xERERHv7+8RERDw8PDwEBAQ8PDw8BAQEPDw8BAQEBDw8PAQEBDw8fHxDw8P8fHx8Q8PD/Hx8Q8PDw/x8fEPDw8P8fHxDg4O8vLy8g4ODvLy8g4ODg7y8vIODg4O8vLyDg4O8/Pz8w0NDfPz8/MNDQ3z8/MNDQ0N8/PzDQ0N8/Pz9AwMDPT09PQMDAz09PQeHh7i4uIeHuLi4h4e4uLjHR3j4+MdHePj4x0d4+PjHR3j4+MdHR3j4x0dHePkHBwc5OQcHBzk5BwcHOTkHBwc5OQcHBzk5OQcHOTl5Rsb5eXlGxvl5eUbG+Xl5Rsb5eXlGxvl5eUbGxvm5hoaGubmGhoa5uYaGhrm5hoaGubmGhoa5uYaGhnn5xkZGefn5xkZ5+fnGRnn5+cZGefn5xkZ5+fnGRjo6OgYGOjo6BgYGOjoGBgY6OgYGBjo6BgYGOjoGBcX6ekXFxfp6RcXF+np6RcX6enpFxfp6ekXF+np6hYW6urqFhbq6uoWFurq6hYW6urqFhYW6uoWFhbq6xUVFevrFRUV6+sVFRXr6xUVFevrFRUV6+vrFRXr7OwUFOzs7BQU7OzsFBTs7OwUFOzs7BQU7OzsFBQU7e0TExPt7RMTE+3tExMT7e0TExPt7RMTE+3tExMS7u7uEhLu7u4SEu7u7hIS7u7uEhLu7u4SEu7u7hIR7+/vERHv7+8RERHv7xEREe/vERER7+8RERHv7xEQEPDwEBAQ8PAQEBDw8PAQEPDw8BAQ8PDwEBDw8PEPD/Hx8Q8P8fHxDw/x8fEPDw/x8Q8PD/HxDw8P8fIODg7y8g4ODvLyDg4O8vIODg7y8g4ODvLy8g4O8vPzDQ3z8/MNDfPz8w0N8/PzDQ3z8/MNDfPz8w0NDfT0DAwM9PQMDAz09AwMAAAAAAAA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+vr6/gEEBQYHCAgFAgEA//7+/v7+////////AAECAgMDAwMFBgcICAgJCQcFBAMCAgICBAYHCAkJCQkIBwYGBQUFBQQEAwMDAwMDAwMDAwMDAwMA//39/Pz7+/8CBAUGBwcHAwH//fz8+/v/AgQGBwcICAcGBgYFBQUFAwEA//7+/f38+/r6+fn5+f0AAgMEBQUFBQUEBAQEBAQFBgYGBwcHBwMA/v38+/r6+vn5+fn5+fn5+fn5+fn5+fv9/v///wAAAgMEBAQFBQUDAQD///7+/vz7+vn5+Pj4+vz9/v7//////////////wEDBAUFBgYGCAgJCQoKCgoHBQQDAgEBAf/+/f38/Pz8+/v6+vr6+vr4+Pf39vb29vb29vb29vb29/j4+Pn5+fn6+vr6+vr7+/z8/f39/v7+AAIEBQUGBgYHBwcHCAgICAgHBwcHBwcHBgUEBAQDAwMFBwgICQkJCgoJCQkJCQkJBQIA//79/Pz9/f39/f39/QEEBgcICQkJCgoKCgoKCgoGAwEA//7+/v38/Pz7+/v7/gECBAQFBQYB/vz7+vn4+P0BBAYHCAgJBAH//vz8+/v+AAIDBAUFBQQEAwMDAwMCAgEAAAAAAAACBAUGBgcHBwMB//79/Pz7/gABAgMDBAQB//79/Pz7+/4AAgMEBAUFBAQDAwMDAwMDAwMDAwMDAwQFBQUGBgYGBAIBAQAAAAABAQICAwMDAwQFBQYGBgYGBwcICAgICAgGBQQEBAMDA//9+/r5+Pj4+vz9/v7///8CBAUGBgcHBwYGBQUFBAQEAf/9/Pv7+vr9AAEDAwQEBQUFBQUFBQUFAf79+/r6+fn5+fn5+fn5+fv9/v8AAAEB//79/Pz7+/v6+fj39/f39/z/AQMEBQYGBwcICAgICAgJCQkJCQkJCQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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8RIfDBsgHhMTDyEbHxgWIyQfHCIUEh4dHx4VDR0hGRMgEA4YFx4LIRIWCxIX9eLf8vXq6vPp6Ojj4+Xe5/D04eXz9ubh8eXt9eXk6+Dp7Onw7+3y4uHk4vP0IBQeIR0fGwoQDxYXIBEgDhsRFhgLFhkQCxcPDQ4WFBILDRcTDRwXER8XDRMP8/Pi4u/s5+vj6u327+7h6+3w6Pby8vj45fXu7+Hh8ur3+O7v7+70+Orq6uMLCxgNFR4SHg8PCwsQGRcNCQgOFAgJFg0IGQoXCRoTDwwZERQPCw0NFxoZDw737vDk8+3o7efq6+zq5/Xv7PHm6evu9u7s8PTr8uzk5OTr6O/07vTr6PXx6Q4ZCRgKGBIJCw4TFxkMEhcLFgwSEREYCgsZFBkMDBIWEQgOFRgJDRgWEwoPJigoIC0nIiokICkeLyojMCoeKx8iKCsxLyIoICsmKh8mJh4pMS0xICkpJi0mHykuJSkgLzEeKS8oHyonIx4gLCYnKdje3tHc0dni4dfi1d3f0tXa49XZ4dXg3+DY3NTW4NTb09/e1OHe3tPg39nT39bg3dna19vi3dne5Nbc4t3X1d7d1NQgJSMhICYqIyMoIikcHyUdGyUlJyoiKystIRwoHxwnJycdJyAjJyEhKScqHCceICYoJiQkJR4hIhwhJhsgKisdKSsm2dzX3dfb1+Db4+PY4eLa49fa4OPm3+Lm5tzd4t/X5N3Y29bk2dXl3ODc2+Xj3OPj5d7d5d/c4OLf2Oba4NzX2t3X2CEgGh0cJigoKCEdIh0nHSIjGyQhJCIlGxwjGh4jGx4jHB0gJiEmIBomIBogHxgcGh4dJhocGB0dHRscJCYhIRwmGR/h4efj29rh2t7l4ejh39vg4OTj5+Hg2+Tf4OTi3ePc5+np4t/i5d7j3+Db5ODi4ufm5ujn3efo3t/l6N3l6OLe3t7nIhshIhsjIBgbGxkfHCQdHiMXGiIgIhghGhobHSIgIBkfGyEfGRsfHxkYHxccIBkWIiEgICEcIiMgIBcXHCAWISIXHufi5eDj6eTk4ubl4+Xm6uLg4eHl4ODj3uPq4ubn6Ovm4efh5N/h4ubq4Orj4t/i3+Po5uLr6+fj5ODo5+jo5ebk4+AbGx8aIBUZGhsfGxweIBYdGRweFRQeGx4WGhoVGxcbFRsaHBsdFBQYGBkaFxYWFxkeFhwc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6enp6enp6enp6enp6enp6enp6RcWFhYWFurq6urq6urq6urq6urq6urq6uoWFhYVFRUV6+vr6+vr6+vr6+vr6+vr6+vr6xUVFRUVFOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OwUFBQUFBQU7O3t7e3t7e3t7e3t7e3t7e3t7RMTExMTE+3t7e3u7u7u7u7u7u7u7u7u7u4SEhISEhIS7u7u7u7u7+/v7+/v7+/v7+/v7xEREREREe/v7+/v7+/v7/Dw8PDw8PDw8PDwEBAoKCgoKCjY2NjY2NjY2NnZ2dnZ2dknJycnJ9nZ2dnZ2dnZ2dnZ2dnZ2ScmJiYm2tra2tra2tra2tra2traJiYmJiba2tra29vb29vb29vb29vbJSUlJSXb29vb29vb29vb29zc3NwkJCQkJNzc3Nzc3Nzc3Nzc3Nzc3CQkJCQj3d3d3d3d3d3d3d3d3d3d3SMjIyMj3d3d3d3d3t7e3t7e3t7eIiIiIiLe3t7e3t7e3t7e3t7e398hISEhId/f39/f39/f39/f39/f398hISEhIeDg4ODg4ODg4ODg4ODg4CAgICAg4ODg4ODg4ODh4eHh4eHhHx8fHx/h4eHh4eHh4eHh4eHh4eEfHh4eHh7i4uLi4uLi4uLi4uLi4uIeHh4eHuLi4uPj4+Pj4+Pj4+Pj4x0dHR0d4+Pj4+Pj4+Pj4+Pk5OTkHBwcHBzk5OTk5OTk5OTk5OTk5OTkHBwbGxvl5eXl5eXl5eXl5eXl5eUbGxsbG+Xl5eXl5ubm5ubm5ubm5hoaGhoa5ubm5ubm5ubm5ubm5ufn5xkZGRkZ5+fn5+fn5+fn5+fn5+fnGRkZGRno6Ojo6Ojo6Ojo6Ojo6OgYGBgYGOjo6Ojo6Ojo6enp6enp6RcXFxcXF+np6enp6enp6enp6enp6RYWFhYW6urq6urq6urq6urq6urqFhYWFhbq6uvr6+vr6+vr6+vr6+sVFRUVFevr6+vr6+vr6+vs7Ozs7OwUFBQUFOzs7Ozs7Ozs7Ozs7Ozs7BQUExMT7e3t7e3t7e3t7e3t7e3tExMTExPt7e3t7e7u7u7u7u7u7u7uEhISEhLu7u7u7u7u7u7u7u7v7+8REREREe/v7+/v7+/v7+/v7+/v7xERERER8PDw8PDw8PDw8PDw8CgoKCgo2NjY2NjY2NjY2dnZ2ScnJyfZ2dnZ2dnZ2dnZ2dnZJycnJ9nZ2dra2tra2tra2tomJiYm2tra2tra2tra2tra2iYlJSXb29vb29vb29vb29vbJSUlJdvb29vb29vb3Nzc3NwkJCQk3Nzc3Nzc3Nzc3Nzc3CQkJCTc3N3d3d3d3d3d3d3dIyMjI93d3d3d3d3d3d3d3d0iIiIi3t7e3t7e3t7e3t7e3iIiIiLe3t7e3t7f39/f39/fISEhId/f39/f39/f39/f398hISEhIODg4ODg4ODg4ODg4CAgICAg4ODg4ODg4ODg4OHhHx8fHx/h4eHh4eHh4eHh4eEfHx8fH+Hh4eHi4uLi4uLi4uIeHh4e4uLi4uLi4uLi4uLi4h4eHR3j4+Pj4+Pj4+Pj4+PjHR0dHePj4+Pj4+Pj4+Tk5OQcHBwc5OTk5OTk5OTk5OTk5BwcHBzk5OXl5eXl5eXl5eXlGxsbG+Xl5eXl5eXl5eXl5eUaGhoa5ubm5ubm5ubm5ubm5hoaGhrm5ubm5ubm5+fn5+fnGRkZGefn5+fn5+fn5+fn5+cZGRkZ5+jo6Ojo6Ojo6Ojo6BgYGBjo6Ojo6Ojo6Ojo6OjpFxcXFxfp6enp6enp6enp6ekXFxcXF+np6enp6urq6urq6hYWFhYW6urq6urq6urq6urqFhYWFRXr6+vr6+vr6+vr6+vrFRUVFevr6+vr6+vr6+zs7OwUFBQU7Ozs7Ozs7Ozs7Ozs7BQUFBTs7Ozt7e3t7e3t7e3tExMTE+3t7e3t7e3t7e3t7e0TEhIS7u7u7u7u7u7u7u7u7hISEhLu7u7u7u7u7u/v7+/vEREREe/v7+/v7+/v7+/v7+8RERER7+/w8PDw8PDw8PDw8BAQKCgoKNjY2NjY2NjY2CgnJ9nZ2dnZ2dnZ2dknJyfZ2dnZ2dnZ2dnZJycn2tra2tra2tra2iYmJtra2tra2tra2iYmJiba2tvb29vb29slJSXb29vb29vb29vbJSUl29vb29vc3Nzc3CQkJNzc3Nzc3Nzc3NwkJCTc3Nzc3Nzc3d0jIyPd3d3d3d3d3d3dIyMj3d3d3d3d3d3d3SIiIt7e3t7e3t7e3t4iIiLe3t7e3t7e3t4iIiEh39/f39/f39/fISEh39/f39/f39/f3yEhId/g4ODg4ODg4OAgICDg4ODg4ODg4ODgICAg4ODg4eHh4eHhHx8f4eHh4eHh4eHh4R8fH+Hh4eHh4eLi4uIeHh7i4uLi4uLi4uLiHh4e4uLi4uLi4uLjHR0dHePj4+Pj4+Pj4x0dHePj4+Pj4+Pj4+MdHBzk5OTk5OTk5OTkHBwc5OTk5OTk5OTk5BwcG+Xl5eXl5eXl5RsbG+Xl5eXl5eXl5eUbGxvl5ebm5ubm5ubmGhoa5ubm5ubm5ubm5hoaGubm5ubn5+fn5xkZGRnn5+fn5+fn5+cZGRnn5+fn5+fn6OjoGBgY6Ojo6Ojo6Ojo6BgYGOjo6Ojo6Ojo6OkXFxfp6enp6enp6ekXFxfp6enp6enp6enpFxcW6urq6urq6urq6hYWFurq6urq6urq6uoWFhbr6+vr6+vr6+sVFRUV6+vr6+vr6+vrFRUV6+vr7Ozs7Ozs7BQUFOzs7Ozs7Ozs7OwUFBTs7Ozs7O3t7e3tExMT7e3t7e3t7e3tExMTE+3t7e3t7e3u7hISEu7u7u7u7u7u7u4SEhLu7u7u7u7u7u7uERER7+/v7+/v7+/vEREREe/v7+/v7+/v7xEREfDw8PDw8PDw8PAQEBAoKCjY2NjY2NjY2Cgo2NnZ2dnZ2dknJ9nZ2dnZ2dnZJyfZ2dnZ2dnZ2ScmJtra2tra2tomJiba2tra2traJiYm2tra2tra29slJdvb29vb29vbJSXb29vb29vb2yUl29vb29zc3NwkJNzc3Nzc3NzcJCQk3Nzc3Nzc3CQkJNzd3d3d3d0jIyPd3d3d3d3d3SMj3d3d3d3d3d0jIt7e3t7e3t7eIiLe3t7e3t7e3iIi3t7e3t7e398hISHf39/f39/fISEh39/f39/f3yEhId/f3+Dg4ODgICDg4ODg4ODg4CAg4ODg4ODg4OAgIODh4eHh4eHhHx/h4eHh4eHh4R8fH+Hh4eHh4eEfHh7i4uLi4uLiHh4e4uLi4uLi4uIeHuLi4uLi4uPjHR3j4+Pj4+Pj4x0d4+Pj4+Pj4+MdHePj4+Pk5OTkHBwc5OTk5OTk5BwcHOTk5OTk5OQcHBzl5eXl5eXl5Rsb5eXl5eXl5eUbG+Xl5eXl5eXlGhrm5ubm5ubm5hoa5ubm5ubm5uYaGhrm5ubm5ufnGRkZ5+fn5+fn5xkZGefn5+fn5+fnGRnn5+fo6Ojo6BgY6Ojo6Ojo6OgYGOjo6Ojo6OjoGBjo6enp6enp6RcXF+np6enp6ekXFxfp6enp6enpFxYW6urq6urq6uoWFurq6urq6urqFhbq6urq6uvr6xUV6+vr6+vr6+sVFevr6+vr6+vrFRUV6+vs7Ozs7BQUFOzs7Ozs7OwUFBTs7Ozs7Ozs7BQU7e3t7e3t7e0TE+3t7e3t7e3tExPt7e3t7e3t7RIS7u7u7u7u7u4SEhLu7u7u7u7uEhIS7u7u7u7v7xEREe/v7+/v7+/vERHv7+/v7+/v7xER7+/v8PDw8PAQEPDw8PDw8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKCgoKCgoKNjY2NjY2NknJycnJycn2dnZ2dnZ2ScnJycnJ9nZ2dna2tomJiYmJiYm2tra2tra2iYmJiYmJtra29vb29slJSUlJSUl29vb29vb2yUlJSUlJSTc3Nzc3NwkJCQkJCQk3Nzc3Nzc3CQkJCQjIyPd3d3d3d0jIyMjIyMj3d3d3d3d3SMjIiIiIiLe3t7e3t4iIiIiIiIi3t7e3t7e3iIhISEhISHf39/f39/fISEhISEh39/f39/f4CAgICAgICDg4ODg4ODgICAgICAg4ODg4OHh4R8fHx8fHx/h4eHh4eHhHx8fHx8f4eHi4uLi4h4eHh4eHh7i4uLi4uLiHh4eHh4eHePj4+Pj4x0dHR0dHR3j4+Pj4+PjHR0dHRwcHOTk5OTk5BwcHBwcHBzk5OTk5OTkHBwbGxsbG+Xl5eXl5RsbGxsbGxvl5eXl5eXlGhoaGhoaGubm5ubm5uYaGhoaGhrm5ubm5ufnGRkZGRkZGefn5+fn5+cZGRkZGRnn5+fo6OjoGBgYGBgYGOjo6Ojo6OgYGBgYGBgY6enp6enpFxcXFxcXF+np6enp6ekXFxcXFxYW6urq6urqFhYWFhYWFurq6urq6uoWFhYWFRUV6+vr6+vrFRUVFRUVFevr6+vr6+sVFRQUFBQU7Ozs7Ozs7BQUFBQUFOzs7Ozs7OwTExMTExMT7e3t7e3t7RMTExMTE+3t7e3t7u4SEhISEhIS7u7u7u7u7hISEhISEu7u7u/v7+8RERERERER7+/v7+/v7xERERERERHw8PDw8PAQEBAQEBAoKCgoKCjY2NjY2CgoJycn2dnZ2dknJycnJ9nZ2dnZJycnJyfZ2dra2iYmJiYm2tra2tomJiYmJtra2traJiYlJSXb29vb29slJSUlJdvb29vbJSUlJSXb3Nzc3CQkJCQk3Nzc3NwkJCQkJNzc3NzcJCMjIyPd3d3d3SMjIyMj3d3d3d0jIyMjI93e3t7e3iIiIiIi3t7e3t4iIiIiIt7e3t7eIiEhISHf39/f3yEhISEh39/f398hISEhId/g4ODgICAgICDg4ODg4CAgICAg4ODg4ODgHx8fHx/h4eHh4R8fHx8f4eHh4eEfHx8fH+Li4uLiHh4eHh7i4uLi4h4eHh4e4uLi4uIdHR0dHePj4+PjHR0dHR3j4+Pj4+MdHR0dHOTk5OTkHBwcHBzk5OTk5BwcHBwc5OTk5OUbGxsbG+Xl5eXlGxsbGxvl5eXl5RsbGxsa5ubm5uYaGhoaGubm5ubm5hoaGhoa5ubm5+cZGRkZGefn5+fnGRkZGRnn5+fn5xkZGRgY6Ojo6OgYGBgYGOjo6OjoGBgYGBjo6Ojp6RcXFxcX6enp6enpFxcXFxfp6enp6RcXFhYW6urq6uoWFhYWFurq6urqFhYWFhbq6urr6xUVFRUV6+vr6+sVFRUVFevr6+vrFRUVFBTs7Ozs7OwUFBQUFOzs7OzsFBQUFBTs7O3t7RMTExMT7e3t7e0TExMTE+3t7e3tExMSEhLu7u7u7hISEhIS7u7u7u4SEhISEu7u7+/v7xERERER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/wEBAgICAwMDAf////7+/v79/Pv7+/v7+/v7+/v7+/v7/wIDBAQEBAQA/v38/Pz7+/3+//////////7+/v7+/v7/AAEBAQEBAQAA////////AQICAwMDAwMA//7+/f39/f//AAAAAAAAAgQEBQUFBQUDAgEBAQAAAAIDBAQEBQUFAP79/Pz8/Pv/AQIDAwQEBAIAAP//////AgMEBQUFBQUEAwMCAgICAgD//v7+/v7+AAECAgIDAwMA/v79/f39/f7/AAAAAAAAAQICAgICAgIA/v79/f39/fz8/Pz8/Pz8/wECAwMDAwMA//79/f39/f8BAgICAgMDAQEAAAAAAAD+/v39/f39/QACAgMDAwMEAQAA///////+/v7+/v7+/gACAwMEBAQEBAUFBQUFBQUCAP/////+/gEDBAQEBQUFAf/+/f38/Pz/AQICAwMDAwIBAQEBAQEB///+/v7+/v7+///////////+/v7+/v7+AAEBAQICAgIBAAD/////////////////AAEBAQECAgIA//////////39/Pz8/Pz8/v//AAAAAAACAgMDAwMDAwH//v7+/v7+/v7+/v7+/v4BAgMDBAQEBAH//v39/f39AAIDBAQEBAQCAP///v7+/v7+/f39/f39/wEBAgICAgIDAwMEBAQEBAIBAAAAAAAA//7+/v7+/v79/f39/f39/fz8/Pv7+/v7/gABAQICAgICAgICAgICAgD////+/v7+//8AAAAAAAABAgICAgICAgICAgICAgICAgICAgICAgIDAwQEBAQEBAEA//7+/v7+AQIDBAQEBAQDAgIBAQEBAQD////+/v7+AAEBAQECAgIA/////v7+/v//////////AQICAwMDAwMDAwMDAwMDAwIBAQEBAQEBAgICAwMDAwMDAwMDAwMDAwEAAP///////v39/Pz8/PwAAgMDBAQEBAD+/f38/Pz8/v7////////+/f39/f38/P7/AAAAAAAAAQICAgICAgL//v38/Pz8/P7//wAAAAAAAP////////8AAQEBAQEBAQIDAwMDAwMEAwICAgICAgL//v39/Pz8/P3+/v7///////8AAAAAAAD+/v39/f39/QABAgMDAwMDAQD///////////////////7+/v7+/v7+//8AAAAAAAABAgICAwMDAwD+/v39/f39/v//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+vz9+/r8/fv6+/v6/fr8+/r7/Pz9/fz7/f7//f79/vz+/v8A/f8B/v8A/f/+//7/Af///v///wAAAQH/AAMDAgIBAAADAgIBAAIBAwMBAQEBAgIDAQQDBQMEBQQFAwUDBQYEAwUEBQQGBQYFBQYGBgUFBgQDBAQFAwUDAgIDAwQGBQMGBgQGBQICAgUDBQUGBQMEAgICBAMCAQECAwEEAwIDBAEAAQIDAgACAwIBAQICAAEAAf8BAgD///8AAP7//v7+AP/+/f3///7+//3+/v3+/f39/P3///7+/v38/Pz7/f39+/79/fz9+/78/Pv+/Pz7/f79+/v6+/37+vv7+/v9/Pv8/fz9/f38+/z9/fz8/fv8/f79+/z7/f39/fv8/fz9/Pz8+/z9/f7+/f7+/vz9/f3//f38/v7+/v3+/wD+/v/9//7//gAB/v4A////AAEB/wD+AAH//gABAv8BAf/+Af///wD/AAEA/wD/AQD/AAD/AP8B//8AAQIBAgABAAAB/wAAAQD/AP8AAQAAAf8B/wH/AQAA/wEC/wD/Af///wD/AQH/AQEBAQD//wEB//8AAP///////wABAAD//gH/AAD/AAD/AAEAAAEBAQABAP////8B/wAAAAEBAQH///8BAQEB/wABAgH/AQAA/wEBAAEAAP//AAABAQAAAP8BAQD/AQAA/wD///8AAP8BAgIAAQH/AAEB//8AAQECAP8BAAEBAAH/AQEB////AP8AAAEAAAD//wD/AQEAAAH/AP/+AAAA/wEAAQEA//8AAQD/AQEBAQAA/wEBAAD//wD///8BAQEA//8BAP8BAQAB////AAAAAf8AAQD//////gD/Af//AAEA/wEB/wD/AAAAAf//AAEBAQEAAAD/AQAA/wABAAAA/wH/AAEB////AAAB/wEAAAEAAP////8AAP//AAEBAQABAAEAAQEBAP8AAQEBAAAA//8AAf//AAABAAD///8A//8AAAD///8AAQEBAQAA/wAAAP8A////AAEBAP//AP8BAAD/AAEBAQABAP////8AAQEBAP8AAAABAQH/AP8BAAAAAQABAQAA////AQH/AQD/AAAAAQD/AAD/AQD/AQD/AAEA/wAAAAABAAEBAP//AAD/AP8BAAEA//////8A//8AAQH/AAD/AQAAAAABAQEA/wEA/wAAAAAA////AAD/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SBBBEEMQRRD//wAATAZKAkgERwRFBkcCSAhKBkgCRwRDBEUQ//8AAAECAgIBAgIEAwIDAgQCAQICAgEEBAwABP//AAAtCCgIKgQsBC0Q//9AAkUCSQJMBkwCSgJMAk4CUAJRDAAE//9FAkkCTAJRBlACTgJQAlECUwJVDAAE//8BBAAo//8AAC0IKQgmCCEQAAT//wAs//9FBEMEQQRABD8EPgQ9BDkMAAT//wECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAgECAgIBAgICAQICAgEBAgECAv//AAAoASgBNAEoASgBKAE0ASgBKAEoATQBKAEoASgBNAEoASQBJAEwASQBJAEkATABJAEkASQBMAEkASQBJAEwASQBKAEoATQBKAEoASgBNAEoASgBKAE0ASgBKAEoATQBKAEvAS8BOwEvAS8BLwE7AS8BLwEvATsBLwEvAS8BOwEvASQBJAEwASQBJAEkATABJAEkASQBMAEkASQBJAEwASQBLwEvATsBLwEvAS8BOwEvAS8BLwE7AS8BLwEvATsBLwEoASgBNAEoASgBKAE0ASgBKAEoATQBKAEoASgBNAEoAS8BLwE7AS8BLwEvATsBLwEvAS8BOwEvAS8BLwE7AS8B//8AAEABQwFHAUwBQAFDAUcBTAFAAUMBRwFMAUABQwFHAUwBPAFAAUMBSAE8AUABQwFIATwBQAFDAUgBPAFAAUMBSAFAAUMBRwFMAUABQwFHAUwBQAFDAUcBTAFAAUMBRwFMAUcBSwFOAVMBRwFLAU4BUwFHAUsBTgFTAUcBSwFOAVMBPAFAAUMBSAE8AUABQwFIATwBQAFDAUgBPAFAAUMBSAFHAUsBTgFTAUcBSwFOAVMBRwFLAU4BUwFHAUsBTgFTAUABQwFHAUwBQAFDAUcBTAFAAUMBRwFMAUABQwFHAUwBRwFLAU4BUwFHAUsBTgFTAUcBSwFOAVMBRwFLAU4BUwH//wAATAJMAkoCTAJPAkwCSgJHAkgERwRFBEcETAJMAkoCTAJRAk8CTgJKAkwIRwRLBE8CTgJMAkoCSAJKAkwCTwJOBEwESwRHBEwCTwJTAlECTwJOAk8CUQJTCFIEUwT//wAAAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIBAQQBAgICAQQBAgICAQIBAgECAgIBAgECAgICAQIB//8AAC0GLQIuBC0EKQYpAioEKQQmBiYCJwQmBCgGKAIoBCgEKQYpAioEKQQtBi0CLgQtBCYGJgInBCYELQYtAi4ELQQkBiQCJQQkBCYGJgInBCYEKAYoAigEKAQtBi0CLgQtBCkGKQIqBCkEKAYoAigEKAQtBi0CLgQtBC0GLQIuBC0E//8AADkEPARABEUENQQ5BDwEQQQyBDUEOQQ+BDQEOAQ7BEAENQQ5BDwEQQQ5BDwEQARFBDIENQQ5BD4EOQQ8BEAERQQwBDQENwQ8BDIENQQ5BD4ENAQ3BDsEQAQ5BDwEQARFBDUEOQQ8BEEENAQ4BDsEQAQ5BDwEQARFBDkEPARABEUE//8AADkCPAJABD4CPAI7AjwCOQQ0AjkCOwQ8BD4CQAJBBEACPgI8Aj4CQAgABEACQwJFBEMCQAJBBEACPgI8BD4CQAI5CEECQAI+AjwCOwI8Aj4CNwI5DAAEPAI8AkACQwJBBEAEPgI+AkECRQJDCEACQAJDAkcCRQRDAkECQAg+BDwERQJDAkECQAI+AjwCOwI8Aj4EQARBBEQERQZAAjwEQARFDAAE//8AAAECAwIDAgMCAQIDAgMBAwEDAgECAwIDAgMCAQIDAgMCBAIBAgMCAwIDAgECAwIDAQMBAwIBAgMCAwIDAgECAwIDAgQCAQIDAgMCAwIBAgMCAwEDAQMCAQIDAgMCAwIBAgMCAwIEAgECAwIDAgMCAQIDAgMBAwEDAgECAwIDAgMCAQIDAgMCBAIBAgMCAwIDAgECAwIDAQMBAwIBAgMCAwIDAgECAwIDAgQCAQIDAgMCAwIBAgMCAwEDAQMCAQIDAgMCAwIBAgMCAwIEAgECAwIDAgMCAQIDAgMBAwEDAgECAwIDAgMCAQIDAgMCBAIBAgMCAwIDAgECAwIDAQMBAwIBAgMCAwIDAgECAwIDAgQC//8AAC0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0AioBAAE2AioBAAExAioBAAE2AioBAAExAjIBAAE+AjIBAAE5AjIBAAE+AjIBAAE5AigBAAE0AigBAAEvAigBAAE0AigBAAEvAioBAAE2AioBAAExAioBAAE2AioBAAExAi0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0AjIBAAE+AjIBAAE5AjIBAAE+AjIBAAE5Ai0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0AjEBAAE9AjEBAAE4AjEBAAE9AjEBAAE4AjIBAAE+AjIBAAE5AjIBAAE+AjIBAAE5AigBAAE0AigBAAEvAigBAAE0AigBAAEvAi0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0AioBAAE2AioBAAExAioBAAE2AioBAAExAigBAAE0AigBAAEvAigBAAE0AigBAAEvAi0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0Ai0BAAE5Ai0BAAE0Av//AABRAlUCWAJdAlECVQJYAl0CTgJRAlUCWgJOAlECVQJaAkoCTgJRAlYCSgJOAlECVgJMAlACUwJYAkwCUAJTAlgCTgJRAlUCWgJOAlECVQJaAlECVQJYAl0CUQJVAlgCXQJKAk4CUQJWAkoCTgJRAlYCUQJVAlgCXQJRAlUCWAJdAkkCTAJQAlUCSQJMAlACVQJKAk4CUQJWAkoCTgJRAlYCTAJQAlMCWAJMAlACUwJYAlECVQJYAl0CUQJVAlgCXQJOAlECVQJaAk4CUQJVAloCTAJQAlMCWAJMAlACUwJYAlECVQJYAl0CUQJVAlgCXQJRAlUCWAJdAlECVQJYAl0C//8AAEUBAAFJAQABTAMAAUoBAAFJAQABRwEAAUkBAAFFAwABQAEAAUUBAAFHAwABSQMAAUoBAAFMAQABTgMAAUwBAAFKAQABSQEAAUoBAAFMBwABAARMAQABUAEAAVEDAAFQAQABTAEAAU4DAAFMAQABSgEAAUkDAAFKAQABTAEAAUUHAAFOAQABTAEAAUoBAAFJAQABRwEAAUkBAAFKAQABRAEAAUULAAEABEkBAAFJAQABTAEAAVABAAFOAwABTAMAAUoBAAFKAQABTgEAAVEBAAFQBwABTAEAAUwBAAFQAQABUwEAAVEDAAFQAQABTgEAAUwHAAFKAwABSQMAAVEBAAFQAQABTgEAAUwBAAFKAQABSQEAAUcBAAFJAQABSgMAAUwDAAFOAwABUAMAAVEFAAFMAQABSQMAAUwDAAFRCwABAAT//wEEAwQCBAMEAQQDAgECAgQDAgMCAQQDBAIEAwQBBAMCAQICBAMCAwIBBAMEAgQDBAEEAwIBAgIEAwIDAgEEAwQCBAMEAQQDAgECAgQDAgMCAQQDBAIEAwQBBAMCAQICBAMCAwIBBAMEAgQDBAEEAwIBAgIEAwIDAgEEAwQCBAMEAQQDAgECAgQDAgMCAQQDBAIEAwQBBAMCAQICBAMCAwL//wAALQI5Ai0COQItAjkCLQI5AikCNQIpAjUCKQI1AikCNQIyAj4CMgI+AjICPgIyAj4CKAI0AigCNAIoAjQCKAI0AikCNQIpAjUCKQI1AikCNQItAjkCLQI5Ai0COQItAjkCMgI+AjICPgIyAj4CMgI+Ai0COQItAjkCLQI5Ai0COQIwAjwCMAI8AjACPAIwAjwCMgI+AjICPgIyAj4CMgI+AigCNAIoAjQCKAI0AigCNAItAjkCLQI5Ai0COQItAjkCKQI1AikCNQIpAjUCKQI1AigCNAIoAjQCKAI0AigCNAItAjkCLQI5Ai0COQItAjkCLQI5Ai0COQItAjkCLQI5Av//AABFAUgBTAFRAUUBSAFMAVEBRQFIAUwBUQFFAUgBTAFRAUEBRQFIAU0BQQFFAUgBTQFBAUUBSAFNAUEBRQFIAU0BPgFBAUUBSgE+AUEBRQFKAT4BQQFFAUoBPgFBAUUBSgFAAUQBRwFMAUABRAFHAUwBQAFEAUcBTAFAAUQBRwFMAUEBRQFIAU0BQQFFAUgBTQFBAUUBSAFNAUEBRQFIAU0BRQFIAUwBUQFFAUgBTAFRAUUBSAFMAVEBRQFIAUwBUQE+AUEBRQFKAT4BQQFFAUoBPgFBAUUBSgE+AUEBRQFKAUUBSAFMAVEBRQFIAUwBUQFFAUgBTAFRAUUBSAFMAVEBPAFAAUMBSAE8AUABQwFIATwBQAFDAUgBPAFAAUMBSAE+AUEBRQFKAT4BQQFFAUoBPgFBAUUBSgE+AUEBRQFKAUABQwFHAUwBQAFDAUcBTAFAAUMBRwFMAUABQwFHAUwBRQFIAUwBUQFFAUgBTAFRAUUBSAFMAVEBRQFIAUwBUQFBAUUBSAFNAUEBRQFIAU0BQQFFAUgBTQFBAUUBSAFNAUABRAFHAUwBQAFEAUcBTAFAAUQBRwFMAUABRAFHAUwBRQFIAUwBUQFFAUgBTAFRAUUBSAFMAVEBRQFIAUwBUQFFAUgBTAFRAUUBSAFMAVEBRQFIAUwBUQFFAUgBTAFRAf//AABFAkgCTARKAkgCRwJIAkUEQAJFAkcESARKAkwCTQRMAkoCSAJKAkwIAARMAk8CUQRPAkwCTQRMAkoCSARKAkwCRQhNAkwCSgJIAkcCSAJKAkMCRQwABEgCSAJMAk8CTQRMBEoCSgJNAlECTwhMAkwCTwJTAlEETwJNAkwISgRIBFECTwJNAkwCSgJIAkcCSAJKBEwETQRQBFEGTAJIBEwEUQwABP//DxUGGyQqMDU6PQoKDAoAKS4OFRwhO0JJUDM3CgYBCA0RFRkdIAADAgEByFkCCNhZAggAAgcBIAAAAPxZAggEWgIIEFoCCIACCwEhAAAAOFoCCEBaAghQWgIIgAENAyIAAAB0WgIIfFoCCIRaAgggAgkBIwAAAKhaAghTUkFNX1YxMTMAl4F3bV8ACwDq/+D/1v/I/2n/Y6umm5ljAACkWwII2FsCCARcAghEXAIIdFwCCKhcAgjcXAII8FoCCGxbAgh0WwIIAgcNE/8AAQIFDwwFXHEDCExxAwhAcQMIOHEDCBcYGf/+AAAADQ4PEBESExQVFv/+AAECAwQFBgcICQoLDP/+AP38+/r+AAAAAAAAAORcAggEAAAAEHUDCPBcAggAAAAAKF0CCAwAAADgdAMIMF0CCAAAAABoXQIIBAAAANB0Awh0XQIIAAAAAKxdAggEAAAAwHQDCLhdAggAAAAA9F0CCAcDAACkdAMIAF4CCAAAAAA4XgIIBgMAAIx0AwhEXgIIAAAAAHxeAggDAAAAgHQDCIheAggAAAAAxF4CCAMBAAB0dAMI1F4CCAAAAAAMXwIIAwAAAGh0AwgcXwIIAAAAAFhfAggDAAAAXHQDCGRfAggAAAAAnF8CCAQAAABMdAMIpF8CCAAAAADgXwIIAwAAAEB0AwjoXwIIAAAAABxgAggEAAAAMHQDCChgAggAAAAAYGACCAMAAAAkdAMIcGACCAEAAACsYAIIBgIAAAx0Awi4YAIIAQAAAPRgAggEAAAA/HMDCABhAggBAAAAOGECCAMBAADwcwMIQGECCAEAAAB4YQIIAwAAAORzAwiEYQIIAQAAAMBhAggEAAAA1HMDCMhhAggBAAAABGICCAQBAADEcwMIDGICCAEAAABEYgIICwoAAJhzAwhUYgIIAQAAAGxiAggLCgAAmHMDCHhiAggBAAAAmGICCAMAAACMcwMIpGICCAEAAADYYgIIAwAAAIBzAwjkYgIIAgAAABxjAggCAAAAeHMDCCRjAggCAAAAUGMCCAIAAABwcwMIXGMCCAIAAACMYwIIlGMCCJxjAgisYwIIvGMCCMhjAgjQYwII3GMCCOhjAgj4YwIIBGQCCKxTAggIZAIIDGQCCBBkAggUZAIIEE4CCBhkAggcZAIIIGQCCCRkAggoZAIIFFcCCDxmAggwZAIIwGECCDhkAghAZAIITGQCCFRkAghcZAIIaGQCCHRkAgh8ZAIIiGQCCJBkAgiYZAIIoGQCCKhkAgiwZAIIuGQCCMRkAgjQZAII3GQCCOhkAgj0ZAIIAGUCCAxlAgjIWgIIFGUCCBhlAggcZQIIFFcCCChlAgg0ZQIIQGUCCExlAghYZQIIZGUCCGxlAgh4ZQIIgGUCCEBeAgiMZQIIyFoCCMhaAgiUZQIIjGMCCMhaAgiUZQIImGUCCKBlAgioZQIIrGUCCLBlAgi4ZQIIwGUCCMhlAgjMZQII0GUCCARkAghIVwII1GUCCNhlAgjcZQII6GUCCPRlAggAZgIIyFoCCAxmAggUZgIIHGYCCCRmAggsZgIIOGYCCERmAghQZgIIWGYCCGBmAghsZgIIfGYCCIhmAgiUZgII+GMCCKRmAgiwZgIIvGYCCMhmAggNAAAADwAAAAcAAAAOAAAABwAAAA8AAAANAAAABQAAAAAAAPIAwgBhAKQAAAAAdwAyABEAQQAAAAAAACAAAABAAAAAgAAAAMAQIEAAEBAQBhAQBhAQEBAQEBAQEBAQEBAQEBAQEBAGEBAQEAYQEBAQEAkQABAQABAJEBAQ//////z////w////wP///wECAwAAAAADyAAAAwAAAAOYAQADbAIAAxQDAANsAgADpAMAA1gEAAMUBQADWAQAA9gFAAOsBgADpAcAA6wGAAOgCAADAAQaAIChCAcDFAAAAPJVAAMyAAAA9WcAAAYVAIDBQAYADiYAgNJ4BQMPAAAA8zQAAzwAAAD3dwAAAwgAgIHWBgAGFACAoqQGAAYSAICxOgcAHggAwPDcBQMDAAAAgREAAAMFAgQEBgECAQUAIRoQKUM07UYgUjB7cACwAOAAMAFgARACzAk8BuYEnAMeAxQCuKuelImC535QQAwAAAoUHwMLFBwBBgEBBwwVFwEGERMAAQMAAAQHCgAIDBAUGAAAMDEyMzQ1Njc4OUZQU0NVJSAAAAAKAAAEDAAABA4AAAQEAAgABAAQAAQAIAACAUAABgFAAAoBQAAOAUAAKAEAQLoAAEDGAABA0gAAQN4AAEAyAQBAAAAAAAAAMgBkAJYAyAD7AC0BXwGRAcMB9QEnAlkCigK8Au0CHwNQA4EDsgPjAxMERAR0BKUE1QQEBTQFYwWTBcIF8AUfBk0GewapBtcGBAcxB14Hige3B+IHDgg5CGQIjwi5COMIDQk2CV8JhwmwCdcJ/wkmCk0KcwqZCr4K4woICywLUAtzC5YLuAvaC/wLHQw+DF4MfQydDLsM2Qz3DBQNMQ1NDWkNhA2fDbkN0g3rDQQOHA4zDkoOYA52DosOoA60DsgO2w7tDv8OEA8hDzEPQA9PD10Paw94D4UPkQ+cD6cPsQ+6D8MPyw/TD9oP4Q/nD+wP8A/0D/gP+w/9D/4P/w8AEP8P/g/9D/sP+A/0D/AP7A/nD+EP2g/TD8sPww+6D7EPpw+cD5EPhQ94D2sPXQ9PD0APMQ8hDxAP/w7tDtsOyA60DqAOiw52DmAOSg4zDhwOBA7rDdINuQ2fDYQNaQ1NDTENFA33DNkMuwydDH0MXgw+DB0M/AvaC7gLlgtzC1ALLAsIC+MKvgqZCnMKTQomCv8J1wmwCYcJXwk2CQ0J4wi5CI8IZAg5CA4I4ge3B4oHXgcxBwQH1wapBnsGTQYfBvAFwgWTBWMFNAUEBdUEpQR0BEQEEwTjA7IDgQNQAx8D7QK8AooCWQInAvUBwwGRAV8BLQH7AMgAlgBkADIAAADO/5z/av84/wX/0/6h/m/+Pf4L/tn9p/12/UT9E/3h/LD8f/xO/B387fu8+4z7W/sr+/z6zPqd+m36PvoQ+uH5s/mF+Vf5Kfn8+M/4ovh2+En4Hvjy98f3nPdx90f3Hffz9sr2ofZ59lD2KfYB9tr1s/WN9Wf1QvUd9fj01PSw9I30avRI9Cb0BPTj88LzovOD82PzRfMn8wnz7PLP8rPyl/J88mHyR/Iu8hXy/PHk8c3xtvGg8YrxdfFg8UzxOPEl8RPxAfHw8N/wz/DA8LHwo/CV8Ijwe/Bv8GTwWfBP8EbwPfA18C3wJvAf8BnwFPAQ8AzwCPAF8APwAvAB8ADwAfAC8APwBfAI8AzwEPAU8BnwH/Am8C3wNfA98EbwT/BZ8GTwb/B78IjwlfCj8LHwwPDP8N/w8PAB8RPxJfE48UzxYPF18YrxoPG28c3x5PH88RXyLvJH8mHyfPKX8rPyz/Ls8gnzJ/NF82Pzg/Oi88Lz4/ME9Cb0SPRq9I30sPTU9Pj0HfVC9Wf1jfWz9dr1AfYp9lD2efah9sr28/Yd90f3cfec98f38vce+En4dvii+M/4/Pgp+Vf5hfmz+eH5EPo++m36nfrM+vz6K/tb+4z7vPvt+x38Tvx//LD84fwT/UT9dv2n/dn9C/49/m/+of7T/gX/OP9q/5z/zv8AADIAJHsDCAAAAAAAAAAAIABgAAgICAgIAAEAAAAAAAAAAAAYGBgYGAAYADY2AAAAAAAANjZ/Nn82NgAYfAY8YD4YAABmNRtsVjMAHDYWbjtz3gAYGAwAAAAAADAYDAwMGDAADBgwMDAYDAAAZjz/PGYAAAAYGH4YGAAAAAAAAAAYGAwAAAB+AAAAAAAAAAAAGBgAwGAwGAwGAwA8ZnZ+bmY8ABgcHhgYGBgAPGZgMBgMfgA8ZmA4YGY8ADg8NjN/MDAAfgY+YGBmPAA4DAY+ZmY8AH5gYDAYGBgAPGZmPGZmPAA8ZmZ8YDAcAAAYGAAAGBgAABgYAAAYGAwAYBgGGGAAAAAAfgB+AAAAAAYYYBgGAAA8ZmAwGAAYADxmWlp6BjwAPGZmfmZmZgA+ZmY+ZmY+AHgMBgYGDHgAHjZmZmY2HgB+BgYeBgZ+AH4GBh4GBgYAPGYGdmZmfABmZmZ+ZmZmADwYGBgYGDwAYGBgYGBmPABjMxsPGzNjAAYGBgYGBn4AY3d/a2NjYwBjZ297c2NjADxmZmZmZjwAPmZmPgYGBgAeMzMzMzt+AD5mZj42ZmYAPGYOPHBmPAB+GBgYGBgYAGZmZmZmZjwAZmZmZjw8GABjY2Nrf3djAMNmPBg8ZsMAw2Y8GBgYGAB/MBgMBgN/ADwMDAwMDDwAAwYMGDBgwAA8MDAwMDA8ABg8ZgAAAAAAAAAAAAAAPwAYGDAAAAAAAAAAPGB8ZnwABgY+ZmZmPgAAADwGBgY8AGBgfGZmZnwAAAA8Zn4GPAA4DD4MDAwMAAAAfGZmfGA8BgY+ZmZmZgAYABgYGBgwADAAMDAwMDAeBgZmNh42ZgAYGBgYGBgwAAAAN39rY2MAAAA+ZmZmZgAAADxmZmY8AAAAPmZmPgYGAAB8ZmZ8YGAAAD5mBgYGAAAAPAY8YD4ADAw+DAwMOAAAAGZmZmZ8AAAAZmZmPBgAAABjY2t/NgAAAGM2HDZjAAAAZmZmPBgMAAB+MBgMfgAwGBgMGBgwABgYGBgYGBgADBgYMBgYDAAAbjsAAAAAAAAAAAAAAAAA1Gb9fwEAAADwRy3puICf5QAAU+MQQIjiIGCd5RBAlOgnAADaAFCg4wEwQ+IDcIHgCACA4gEgQuIBEEHiCKAQ5QSQEOVKMmTgScJu4MMwoOFKMoPgzMCg4UnCjOBJ4qDhgJCD4gEMWeNKQqDhw5+g4YCgjOJ/MCkizJ+g4QEMWuN/wCkiBjAD4AEw4eUGwAzgwz8j4MyfLOAJMIPhBwBR4QHA4uUIAIDiA1CF4eL//xoQQIjlFOCI5RhQiOXwR73oHv8v4QBQoOP4///q4BMAAvBHLenAYJ/lAABT4yBAneUQwJblFHCW5SkAANoA4KDjATBD4gNQgeAIAIDiASBC4gEQQeIMMKDhABQQ6UqioOFMoorgyjBj4MpwZ+DDMKDhyjCD4MdwoOHKcIfgysCg4YCgg+IBDFrjgJCH4sOvoOHHj6DhfzAqIgEMWeN/cCgiBDAD4AEw4eUEcAfgx48n4MM/I+AIMIPhBQBR4QFw4uUIAIDiDHCg4QPgjuHg//8aEMCG5RRwhuUY4Ibl8Ee96B7/L+EA4KDj+P//6uATAALwRy3pxHCf5QAAU+MgUJ3lEOCX5RTAl+UqAADaAECg4wEwQ+IDYIHgCACA4gEgQuIBEEHiDjCg4QyAoOEEwBDlCOAQ5UySoOFOwmngzMCg4U7ijOADME7gDMBJ4MMwjuAIgEzgyICM4ICQg+IBDFnjgKCI4sOfoOF/MCkiyJ+g4QEMWuN/gCkiBTAD4AEw4eUFgAjgwz8j4MifKOAJMIPhAQBW4QGA4uUIAIDiA0CE4d///xoQ4IflFMCH5RhAh+XwR73oHv8v4QBAoOP4///q4BMAAvBALekAAFPjFECd5R8AANoA4KDjATBD4gNQgeAIAIDiASBC4gEQQeIIEBDpQzKg4UzCoOGAYIPiAQxW44BwjOLDb6DhfzAmIsxvoOEBDFfjf8AmIgQwA+ABMOHlBMAM4MM/I+DMbyzgBjCD4QUAUeEBwOLlA+CO4QgAgOLp//8aHDCf5Rjgg+XwQL3oHv8v4QDgoOMIMJ/lGOCD5fBAvege/y/h4BMAAjBALekAAFPjDFCd5RkAANoAwKDjATBD4gNAgeAIAIDiASBC4gEQQeIIQBDpQzKg4U4yg+DDMKDhgOCD4gEMXuPD76DhfzAuIgUwA+ABMOHlw+8j4AQAUeEBMOLlDsCM4QgAgOLv//8aHDCf5TBAvegYwIPlHv8v4QDAoOMIMJ/lMEC96BjAg+Ue/y/h4BMAAvBALekAAFPjFECd5SIAANoA4KDjATBD4gNQgeAIAIDiASBC4gEQQeIIEBDpTMKg4UNibODGYKDhQzKG4AbATOCAYIPiAQxW44BwjOLDb6DhfzAmIsxvoOEBDFfjf8AmIgQwA+ABMOHlBMAM4MM/I+DMbyzgBjCD4QEAVeEBwOLlA+CO4QgAgOLm//8aHDCf5Rjgg+XwQL3oHv8v4QDgoOMIMJ/lGOCD5fBAvege/y/h4BMAAvBDLemscJ/lAABT4xxQneUA4JflBMCX5SQAANoAQKDjATBD4gNggeAIAIDiASBC4gEQQeIIARDpQzJu4MPgjuBIgmzgyMCM4IAwjuL/AFPjgICM4s4/oOF/MCOCDjCgkf8AWOPMj6DhDICgkX+AKIIFMAPgATDh5QWACODDPyPgyJ8o4Akwg+EGAFHhAYDi5QNAhOEIAIDi5f//GgDgh+UEwIflGECH5fBDvege/y/hAECg4/j//+rgEwAC8EMt6bRwn+UAAFPjHFCd5QDgl+UEwJflJgAA2gBAoOMBMEPiA2CB4AgAgOIBIELiARBB4ggBEOlDMqDhSDKD4MOAbuDI4I7gw4Bs4MjAjOCAkI7i/wBZ484/oOGAgIziDjCgkX8wI4L/AFjjzI+g4QyAoJF/gCiCBTAD4AEw4eUFgAjgwz8j4MifKOAJMIPhAQBW4QGA4uUDQIThCACA4uP//xoA4IflBMCH5RhAh+XwQ73oHv8v4QBAoOP4///q4BMAAvBDLenEcJ/lAABT4xxQneUA4JflBMCX5SoAANoAQKDjATBD4gNggeAIAIDiASBC4gEQQeIEMBDlCIAQ5UMyoOFIkmPgyZCg4UiCieAJMEPgDoBI4MjgjuAMgEPgyMCM4ICQjuL/AFnjzj+g4YCAjOIOMKCRfzAjgv8AWOPMj6DhDICgkX+AKIIFMAPgATDh5QWACODDPyPgyJ8o4Akwg+EBAFbhAYDi5QNAhOEIAIDi3///GgDgh+UEwIflGECH5fBDvege/y/hAECg4/j//+rgEwAC8E8t6eiwn+UBUKDhDNBN4ggQi+IAAFPjAmCg4TCAneUAQJvlBCCb5QJAkeguAADaAHCg4wEwQ+IDMIXgBDCN5QgAgOIBYEbiAVBF4gjAEOUEMBDlTMJk4MxBhOBDMmLgwyGC4AEwROAOwELgQxGB4EExgeBM4Y7gTsGO4ICQg+IBDFnjw6+g4YCQjOJ/MCoiAQxZ48yfoOF/wCkiCDAD4AEw5eUIwAzgBJCd5QHA5uXDPyPgzM8s4Awwg+EJAFXhCACA4gNwh+Hf//8aAECL5QQgi+UIEIvlDOCL5Rhwi+UM0I3i8E+96B7/L+EAcKDj9f//6uATAALwTy3p7LCf5QFQoOEM0E3iCBCL4gAAU+MCYKDhMICd5QBAm+UEIJvlAkCR6C8AANoAcKDjATBD4gMwheAEMI3lCACA4gFgRuIBUEXiCBAQ6UMyoOFMMoPgw8Bk4MxBhODDMGLgwyGC4AEwROAOwELgQxGB4EExgeBM4Y7gTsGO4ICQg+IBDFnjw6+g4YCQjOJ/MCoiAQxZ48yfoOF/wCkiCDAD4AEw5eUIwAzgBJCd5QHA5uXDPyPgzM8s4Awwg+EFAFnhCACA4gNwh+He//8aAECL5QQgi+UIEIvlDOCL5Rhwi+UM0I3i8E+96B7/L+EAcKDj9f//6uATAALwTy3p/LCf5QFQoOEM0E3iCBCL4gAAU+MCYKDhMICd5QBAm+UEIJvlAkCR6DMAANoAcKDjATBD4gMwheAEMI3lCACA4gFgRuIBUEXiBDAQ5QjAEOVDMqDhTJJj4MmQoOFMwongCTBD4ATATODMQYTgAjBD4MMhguABMETgQxGB4A4wQuBBwYHgQ+GO4E4xjuCAkIziAQxZ48yvoOGAkIPif8AqIgEMWePDn6DhfzApIgjADOABwOXlCDAD4ASQneUBMOblzM8s4MM/I+AMMIPhBQBZ4QgAgOIDcIfh2v//GgBAi+UEIIvlCBCL5Qzgi+UYcIvlDNCN4vBPvege/y/hAHCg4/X//+rgEwAC8E8t6axSn+VIMJXlGMCV5VTQTeJAMI3lnDKf5QAAXOMAIJPlCMCVFZIMDBA8MJXljMCgEUzCoBEAAFPjLDCVFZIDAxBgAJXlhICV5YMwoBFDMqARAABQ4wIAoBEAAFjjABCN5XQQlRWRAgIQgiCgEUKCoBEAIJ3lAABS4wCgleUksJXlbGCV5bxI1eGAAADaKBKf5Sgin+UA4JHlngwH4ADgkuWeDAngCMCR5ZAMDOBMwqDhHMCN5QjAkuWcAADgQAKg4SAAjeUEAJHlDBCR5ZADDOCRCADgBBCS5TgAjeWRAwDgDDCS5ZMIAuA8II3lBCCV5QQgjeUcIJXlDCCN5SggleUIII3lQCCV5RAgjeVwIJXlJHCN5SwgjeUkMJ3ljiDV5SiQjeVEII3lACBj4hTAjeUYAI3lQOCd5UyQleUwII3lKDCd5QAwY+ILwKDhCgCg4QBwoONoEZ/lNDCN5UigjeVMsI3lAAAA6gNwoOEMMJ3lEKCd5QAAU+EwII2SJCCNggwAkugMAFrhFKCd5QIgioAKIEKQGKCdhRignZUDMIqACjBDkASgneUKAIDgCKCd5RCxn+UKwIzgrq2g4dqgm+EcsJ3lmisr4AsgoOEgsJ3lmjsr4AAAWOMLMKDhCeCO4BgAAAosoJ3lCmCG4AEIVuMMAAA6AQha46SgJOABoAriCreg4aRAi+FAsMTjCrOL4USgneUGaKAhJmigIQFoRjIAAFrjC0CgETigneUBABTjCiBCEAogggA8oJ0VPKCdBQowQxAKMIMADAAB6QAgneUBMIfiAwBS4QgQgeLB//8aQDCd5Qkwg+CXOSLgSKCN4gAMmuhAII3lCCCd5QIwi+CXMivgBCCd5QIwiuCXMirgQDCd5QCgheUksIXlSDCF5WxgheW8SMXhVNCN4vBPvege/y/hkBQAAkABAAJ4FAACYBQAAggQAAPgDwAD8Ect6QCAoOEAAFLiIFCd5QTAmOUXAADaDECY5QNgoOEIkJjlADCg4wBwmOVQEJ/lBEig4QkAAOrSoJfhBEAR6ZYqIuCV6i7gAABT4QgQgeIJwIzgECAB5QzgAeUFAAAKDABU4SwooOEBMIPi8f//igAwoOMYMIjlBMCI5fBHvege/y/hCBAAAwfAAuKiIbDhBQAACvAHLen4B7Ho+Aeg6AEgUuL7//+K8Ae96AHAXOIIALEoCACgKPv//4oe/y/hB8AC4qIhsOELAAAK8AMt6QEwoOEBQKDhAVCg4QFgoOEBcKDhAYCg4QGQoOH6A6DoASBS4vz//4rwA73oAcBc4gIAoCj8//+KHv8v4QEDoOMAwrDlLCgM4LIgwOEIMhDlAjCD4QgyAOV8EJ/lCDCR5AIAE+EBAAAaAABT4/r//xoEEBEVAABREx7/LwEIMJDlCADA5QIgzOGwIMDhACBP4QxQLekAMA/h3zDD4x8wg+MD8CnhAUAt6Q/goOER/y/hAUC96AgAwOUAMA/h3zDD45Iwg+MD8CnhDFC96ALwaeGwwMDhCDCA5R7/L+GwLgACBgBS4y8AANoBMCDggz+w4SwAAEoeAAAqBDBw4oM/sOEBMNFEATDARAEgQkKyMNEgsjDAIAIgQiIgAFLjBwAAuvAHLekgIFLi+AexqPgHoKj7///K8Ae96B7/LwEgIILiBABS4woAALoEIFLiBDCRpAQwgKT7///KHv8vAYIvsOGyMNEgsjDAIAAw0UUAMMBFHv8v4QEAEOMBMNEUATDAFAEgQhICIFLisjDRoLIwwKD7///KHv8vAQIgkuIAMNEVADDAFR7/L+EBIFLiATDRpAEwwKT7///KHv8v4QFALenG///rAUC96B7/L+EIAFHjJAAAugQwYOKDP7DhASDARAEQQUIBIMAkASDAJAIQQSICLKDhIiSC4SIoguECMKDhQABR4wwAALrwAy3pAkCg4QNQoOECYKDhA3Cg4QKAoOEDkKDhIBBR4vwDoKj8///K8AO96B7/LwEgEIHiCBBR4gwAoKj8///KHv8vAQQQkeIEIICkHv8vAYEfsOGyIMAgASDARB7/L+EBEFHiASDApPz//8oe/y/hATCg4QIQoOEDIKDhAUAt6c///+sBQL3oHv8v4ShLAggoSwIIKEsCCLROAgg4SwIIREsCCLROAghUSwIIZEsCCLl5N55nRSMB/////wxXAggUVwIIHFcCCCRXAgiAVAIILFcCCDxXAghMVwIIXFcCCGhXAgh0VwIIiFcCCJRXAgigVwIIsFcCCLxXAgjIVwII0FcCCNxXAgjoVwII+FcCCAxYAggkWAIIOFgCCEhYAghoWAIIeFgCCIxYAgiYWAIIrFgCCLxYAgjQWAII5FgCCPxYAggUWQIIXFcCCChZAggwWQIIOFkCCEBZAghIWQIIUFkCCFhZAghgWQIIjFQCCGhZAghwWQIIfFkCCBhKAgiEWQIIjFkCCJBZAgiUWQIImFkCCJxZAgigWQIIpFkCCKhZAgisWQIIsFkCCLRZAgi4WQIIvFkCCMBZAgjEWQII//////////8QAAAAEAAAAP////8QAAAAAAD/Azw8HgA=";

/* BSR player API: BSRPlayer.start(canvasElement) ; BSRPlayer.key(name, isDown) with name in
   A,B,SELECT,START,R,L,UP,DOWN,LEFT,RIGHT ; BSRPlayer.unlockAudio() on first user tap ; BSRPlayer.setPaused(bool) ; BSRPlayer.reset() */
(function(){
  try { window.localStorage; } catch(e) {}
  GameBoyAdvanceKeypad.prototype.registerHandlers = function(){};
  GameBoyAdvance.prototype.retrieveSavedata = function(){};
  GameBoyAdvance.prototype.storeSavedata = function(){};
  function b64(s){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return u.buffer;}
  var KEYS={A:0,B:1,SELECT:2,START:3,RIGHT:4,LEFT:5,UP:6,DOWN:7,R:8,L:9};
  var held=0, gba=null, paused=false, last=0, acc=0, ctx2d=null, canvas=null;
  var KB={90:'A',88:'B',13:'START',16:'SELECT',8:'SELECT',65:'L',83:'R',38:'UP',40:'DOWN',37:'LEFT',39:'RIGHT',32:'A'};
  function apply(){ if(gba) gba.keypad.currentDown = (~held) & 0x3FF; }
  var P = window.BSRPlayer = {
    start: function(c){
      canvas=c; c.width=240; c.height=160;
      gba = new GameBoyAdvance();
      gba.logLevel = gba.LOG_ERROR;
      gba.setCanvasDirect(c);
      gba.setBios(b64(BSR_BIOS_B64));
      gba.setRom(b64(BSR_ROM_B64));
      try { gba.audio.pause(false); } catch(e){}
      document.addEventListener('keydown', function(e){ var k=KB[e.keyCode]; if(k){ P.key(k,true); e.preventDefault(); P.unlockAudio(); } });
      document.addEventListener('keyup', function(e){ var k=KB[e.keyCode]; if(k){ P.key(k,false); e.preventDefault(); } });
      requestAnimationFrame(loop);
    },
    key: function(name, down){ var b=KEYS[name]; if(b===undefined) return; if(down) held|=(1<<b); else held&=~(1<<b); apply(); },
    unlockAudio: function(){ try{ var ac=gba&&gba.audio&&gba.audio.context; if(ac&&ac.state!=='running') ac.resume(); }catch(e){} },
    setPaused: function(p){ paused=!!p; try{ gba.audio.pause(paused); }catch(e){} },
    reset: function(){ held=0; gba.setRom(b64(BSR_ROM_B64)); try{ gba.audio.pause(false);}catch(e){} },
    toggleSound: function(){ if(!gba||!gba.audio) return true; gba.audio.masterEnable=!gba.audio.masterEnable; return gba.audio.masterEnable; }
  };
  function loop(t){
    requestAnimationFrame(loop);
    if(!last){ last=t; return; }
    var dt=Math.min(100, t-last); last=t;
    if(paused) return;
    acc+=dt; var n=0;
    while(acc>=16.7427 && n<4){ apply(); try{ gba.advanceFrame(); }catch(e){ console.error(e); } acc-=16.7427; n++; }
    if(n===4) acc=0;
  }
})();
