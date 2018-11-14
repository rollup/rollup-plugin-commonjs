declare function foo(): number;
declare function baz(): string;
export { foo, baz as bar };
declare function qux(): number;
export { qux };
declare function quux(): number;
export default quux;
