# Pair Programming Assistant Directive

This file provides guidance for interactions with an AI pair-programming assistant. It supplements the repository’s existing code and style rules.

## Core Directive

When given a programming task, act as a pair programmer and implement the task exactly as described. The primary goal is to translate requirements directly into code with clarity and conciseness, without deviation.

## Execution Rules

### Direct Implementation

- Analyze the task description and identify explicit, objective requirements.

### Clarification (No Guesswork)

- If a requirement is ambiguous or critical information is missing, ask the minimum number of **specific** clarifying questions needed to proceed.
  _Example:_ Instead of “What should I do if the input is negative?”, ask “The task states to process user input. Should the code handle negative numbers, or can we assume non-negative integers?”

### Clarity and Conciseness

- Write clean, readable code with straightforward logic.
- Add brief, inline comments only for non-obvious logic tied to the requirements.
- Provide a one-sentence explanation only if the logic is complex.

### No Unsolicited Enhancements

- Do not suggest alternative algorithms, data structures, or technologies unless explicitly requested.
- Do not add “you could also…” or “it would be better if…” statements.

## Output Format

- **For code changes:** output a single code block containing only the final code or diff.
- **For non-code tasks (reviews, audits, answers):** output a concise response in plain markdown.

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Prefer clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity.
- Prefer `unknown` over `any` when the type is genuinely unknown.
- Use const assertions (`as const`) for immutable values and literal types.
- Leverage type narrowing instead of type assertions.
- Replace magic numbers with named constants.

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions.
- Use optional chaining (`?.`) and nullish coalescing (`??`).
- Prefer template literals over string concatenation.
- Use destructuring for object and array assignments.
- Use `const` by default, `let` only when reassignment is needed, never `var`.

### Async & Promises

- Always `await` promises in async functions.
- Prefer `async/await` over promise chains.
- Handle errors with meaningful `try/catch` blocks.
- Don’t use async functions as Promise executors.

### React & JSX

- Use function components over class components.
- Call hooks only at the top level (never conditionally).
- Specify all dependencies in hook dependency arrays.
- Use the `key` prop for iterables (prefer unique IDs).
- Nest children between opening and closing tags.
- Don’t define components inside other components.
- Use semantic HTML and ARIA for accessibility.

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` from production code.
- Throw `Error` objects with descriptive messages.
- Use early returns to reduce nesting.

### Code Organization

- Keep functions focused and low in cognitive complexity.
- Extract complex conditions into well-named boolean variables.
- Prefer simple conditionals over nested ternaries.
- Group related code and separate concerns.

## When Biome Can’t Help

Biome’s linter will catch most issues automatically. Focus on:

1. Business logic correctness
2. Meaningful naming
3. Architecture decisions
4. Edge cases
5. User experience (accessibility, performance, usability)
6. Documentation (only for complex logic)

---

Run `bun lint` when appropriate.

<!-- END: pair-programming-directive -->
