```markdown
# mermail-skills Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `mermail-skills` TypeScript repository. You'll learn how to structure files, write code, follow commit conventions, and test your code in alignment with the project's standards. This guide is ideal for contributors seeking to maintain consistency and quality in their contributions.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userProfile.ts`, `emailSender.test.ts`

### Import Style
- Use **relative imports** for referencing other files within the project.
  - Example:
    ```typescript
    import { sendEmail } from './emailSender';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // emailSender.ts
    export function sendEmail(...) { ... }
    ```

### Commit Messages
- Follow the **Conventional Commits** specification.
- Use the `feat` prefix for new features.
  - Example:
    ```
    feat: add support for multiple email recipients
    ```

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new capability or functionality.
**Command:** `/add-feature`

1. Create a new file using camelCase naming.
2. Implement the feature using TypeScript.
3. Use relative imports for dependencies.
4. Export functions or variables using named exports.
5. Write a corresponding test file with the `.test.ts` suffix.
6. Commit your changes with a message starting with `feat:`.
   - Example: `feat: implement user notification system`

### Writing and Running Tests
**Trigger:** When validating new or existing functionality.
**Command:** `/run-tests`

1. Create a test file named with the `.test.ts` suffix (e.g., `emailSender.test.ts`).
2. Write your tests according to the project's testing framework (framework is currently unknown; follow existing patterns).
3. Run the tests using the project's test runner (refer to project documentation or scripts).

## Testing Patterns

- Test files are named using the pattern `*.test.ts`.
- Place test files alongside the modules they test.
- The specific testing framework is not detected; review existing test files for structure and assertions.
- Example test file:
  ```typescript
  // emailSender.test.ts
  import { sendEmail } from './emailSender';

  describe('sendEmail', () => {
    it('should send an email successfully', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command        | Purpose                                   |
|----------------|-------------------------------------------|
| /add-feature   | Start the process for adding a new feature|
| /run-tests     | Run the test suite                        |
```
