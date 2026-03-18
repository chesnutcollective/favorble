import { faker } from "@faker-js/faker";

interface User {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a fake user for testing
 */
export function createUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    username: faker.internet.username(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  };
}

export function createUserInput(
  overrides?: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>,
) {
  return {
    email: faker.internet.email(),
    username: faker.internet.username(),
    ...overrides,
  };
}
