/**
 * Two projects:
 *  - "shared": pure TS core (money math, state machine, schemas) via ts-jest.
 *    Fast, no native mocks. This is the highest-value test layer.
 *  - (Component/hook tests would use jest-expo; deferred — the money spine is
 *    what must be provably correct for a betting product.)
 */
module.exports = {
  projects: [
    {
      displayName: 'shared',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/shared/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          { tsconfig: { strict: true, esModuleInterop: true, types: ['jest', 'node'] } },
        ],
      },
    },
  ],
};
