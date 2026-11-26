// Controllable clock abstraction.
// Allows services and jobs to ask for the current time, enabling tests to freeze or advance "now".

export class Clock {
  #fixedTime = null;

  /**
   * Returns current Date object (real system time or simulated fixed time).
   * @returns {Date}
   */
  now() {
    return this.#fixedTime ? new Date(this.#fixedTime) : new Date();
  }

  /**
   * Returns current ISO 8601 string.
   * @returns {string}
   */
  iso() {
    return this.now().toISOString();
  }

  /**
   * Returns current timestamp in milliseconds.
   * @returns {number}
   */
  nowMs() {
    return this.now().getTime();
  }

  /**
   * Freezes or sets the clock to a specific time.
   * @param {Date|string|number} time
   */
  set(time) {
    this.#fixedTime = new Date(time).getTime();
  }

  /**
   * Advances the clock by a given number of milliseconds.
   * @param {number} ms
   */
  advance(ms) {
    const current = this.#fixedTime ?? Date.now();
    this.#fixedTime = current + ms;
  }

  /**
   * Resets the clock to use the real system time.
   */
  reset() {
    this.#fixedTime = null;
  }
}

export const clock = new Clock();
