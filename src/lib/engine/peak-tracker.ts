export interface PeakSample {
	appCpu?: number;
	appMem?: number;
	dbCpu?: number;
	dbMem?: number;
	dbConnections?: number;
}

export interface PeakValues {
	appCpu: number;
	appMem: number;
	dbCpu: number;
	dbMem: number;
	dbConnections: number;
}

export interface PeakTracker {
	observe(sample: PeakSample): void;
	peaks(): PeakValues;
}

export function createPeakTracker(idle: PeakValues): PeakTracker {
	const peaks: PeakValues = { ...idle };
	return {
		observe(sample: PeakSample): void {
			if (sample.appCpu !== undefined && sample.appCpu > peaks.appCpu) peaks.appCpu = sample.appCpu;
			if (sample.appMem !== undefined && sample.appMem > peaks.appMem) peaks.appMem = sample.appMem;
			if (sample.dbCpu !== undefined && sample.dbCpu > peaks.dbCpu) peaks.dbCpu = sample.dbCpu;
			if (sample.dbMem !== undefined && sample.dbMem > peaks.dbMem) peaks.dbMem = sample.dbMem;
			if (sample.dbConnections !== undefined && sample.dbConnections > peaks.dbConnections)
				peaks.dbConnections = sample.dbConnections;
		},
		peaks(): PeakValues {
			return { ...peaks };
		},
	};
}
