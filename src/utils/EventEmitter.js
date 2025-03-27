export class EventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, callback) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this._events[event]) return this;
    if (!callback) {
      delete this._events[event];
      return this;
    }
    this._events[event] = this._events[event].filter(cb => cb !== callback);
    return this;
  }

  emit(event, ...args) {
    if (!this._events[event]) return this;
    this._events[event].forEach(callback => callback(...args));
    return this;
  }
}