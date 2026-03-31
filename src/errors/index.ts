export class PowerMemError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PowerMemError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PowerMemInitError extends PowerMemError {
  constructor(message: string) {
    super(message, 'INIT_ERROR');
    this.name = 'PowerMemInitError';
  }
}

export class PowerMemStartupError extends PowerMemError {
  constructor(message: string) {
    super(message, 'STARTUP_ERROR');
    this.name = 'PowerMemStartupError';
  }
}

export class PowerMemConnectionError extends PowerMemError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'PowerMemConnectionError';
  }
}

export class PowerMemAPIError extends PowerMemError {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message, 'API_ERROR');
    this.name = 'PowerMemAPIError';
    this.statusCode = statusCode;
  }
}
