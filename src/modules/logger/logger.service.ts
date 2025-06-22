import { Injectable, Logger, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends Logger {
  private contextName: string;

  // override the default context setting
  setContext(context: string) {
    this.contextName = context;
  }

  // Override log methods to add more structure
  log(message: any, context?: string) {
    super.log(this.formatMessage(message), context || this.contextName);
  }

  error(message: any, trace?: string, context?: string) {
    super.error(this.formatMessage(message), trace, context || this.contextName);
  }

  warn(message: any, context?: string) {
    super.warn(this.formatMessage(message), context || this.contextName);
  }

  debug(message: any, context?: string) {
    super.debug(this.formatMessage(message), context || this.contextName);
  }

  verbose(message: any, context?: string) {
    super.verbose(this.formatMessage(message), context || this.contextName);
  }

  // Custom formatter to ensure logs are structured objects
  private formatMessage(message: any): string {
    if (typeof message === 'object' && message !== null) {
      // If the message is already an object, just stringify it
      return JSON.stringify(message);
    }
    // If it's a simple string, wrap it in a structured log format
    return JSON.stringify({ message });
  }
}
