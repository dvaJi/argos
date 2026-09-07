# Plan

1. Replace the stateful Radix scroll-area wrapper with a native overflow container behind the same shared `ScrollArea` API.
2. Keep the exported `ScrollBar` symbol as a compatibility component even though current consumers do not render it directly.
3. Add a regression test that rerenders the component after a state update.
4. Run the affected settings tests, React Doctor, type checking, formatting, and linting.
