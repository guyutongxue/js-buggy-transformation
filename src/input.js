const foo = () => (args) => class A {};
export const TestA = new (foo()`bar`)();

const baz = () => ({ qux: class A {} })
export const TestB = new (baz()?.qux)();
