export type ApiStatus = 'loading' | 'connected' | 'error';

export interface DiagnosticState {
  apiStatus: ApiStatus;
  channelCount: number | null;
  errorMessage: string | null;
}

export const initialDiagnosticState: DiagnosticState = {
  apiStatus: 'loading',
  channelCount: null,
  errorMessage: null,
};
