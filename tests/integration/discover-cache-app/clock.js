// Test-only clock in an isolated Next server; no hooks or endpoints ship in the app.
const state = globalThis.discoverFixture ??= { offset: 0, fail: false, count: 0 };
if (!globalThis.discoverFixtureDate) {
  const Original = Date;
  class FixtureDate extends Original {
    constructor(...args) { super(...(args.length ? args : [Original.now() + state.offset])); }
    static now() { return Original.now() + state.offset; }
  }
  globalThis.Date = FixtureDate;
  const origin = performance.timeOrigin;
  Object.defineProperty(performance, "timeOrigin", { get: () => origin + state.offset });
  globalThis.discoverFixtureDate = true;
}
export { state };
