import axios from 'axios';
import { ReadResult } from 'file-disk';
import { basename } from 'path';
import { unescape } from 'querystring';
import { parse } from 'url';

import { Metadata } from './metadata';
import { SourceDestination } from './source-destination';

export class Http extends SourceDestination {
	// Only implements reading for now
	private size: number;
	private acceptsRange: boolean;
	private ready: Promise<void>;

	constructor(private url: string) {
		super();
		this.ready = this.getInfo();
	}

	private async getInfo() {
		const response = await axios({ method: 'head', url: this.url });
		this.size = parseInt(response.headers['content-length'], 10);
		this.acceptsRange = (response.headers['accept-ranges'] === 'bytes');
	}

	async canRead(): Promise<boolean> {
		await this.ready;
		return this.acceptsRange;
	}

	async canCreateReadStream(): Promise<boolean> {
		return true;
	}

	async _getMetadata(): Promise<Metadata> {
		await this.ready;
		let name;
		const pathname = parse(this.url).pathname;
		if (pathname !== undefined) {
			name = basename(unescape(pathname));
		}
		return {
			size: this.size,
			name,
		};
	}

	private getRange(start = 0, end?: number) {
		// start and end are inclusive
		let range = `bytes=${start}-`;
		if (end !== undefined) {
			range += end;
		}
		return range;
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		const response = await axios({
			method: 'get',
			url: this.url,
			responseType: 'arraybuffer',
			headers: {
				Range: this.getRange(sourceOffset, sourceOffset + length - 1),
			},
		});
		const bytesRead = response.data.length;
		// TODO: it would be nice to avoid copying here but it would require modifying axios
		response.data.copy(buffer, bufferOffset);
		return { bytesRead, buffer };
	}

	async _createReadStream(start = 0, end?: number): Promise<NodeJS.ReadableStream> {
		const response = await axios({
			method: 'get',
			url: this.url,
			headers: {
				Range: this.getRange(start, end),
			},
			responseType: 'stream',
		});
		return response.data;
	}
}
