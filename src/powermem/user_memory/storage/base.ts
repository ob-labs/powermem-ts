/**
 * User profile types and abstract storage base.
 * Port of Python powermem/user_memory/storage/base.py.
 */

export interface UserProfile {
  id: string;
  userId: string;
  profileContent?: string;
  topics?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type UserProfileStoreConstructor = new (config?: any) => UserProfileStoreBase;

export abstract class UserProfileStoreBase {
  private static readonly registry = new Map<string, UserProfileStoreConstructor>();
  private static readonly classPaths = new Map<string, string>();

  private static normalizeProvider(provider: string): string {
    return provider.toLowerCase() === 'postgres' ? 'pgvector' : provider.toLowerCase();
  }

  static registerProvider(
    provider: string,
    ctor: UserProfileStoreConstructor,
    classPath?: string,
  ): void {
    const normalized = this.normalizeProvider(provider);
    this.registry.set(normalized, ctor);
    if (classPath) {
      this.classPaths.set(normalized, classPath);
    }
  }

  static getProviderClassPath(provider: string): string | undefined {
    return this.classPaths.get(this.normalizeProvider(provider));
  }

  static getProviderConstructor(provider: string): UserProfileStoreConstructor | undefined {
    return this.registry.get(this.normalizeProvider(provider));
  }

  static getSupportedProviders(): string[] {
    return Array.from(this.registry.keys()).sort();
  }

  abstract saveProfile(
    userId: string,
    profileContent?: string,
    topics?: Record<string, unknown>,
  ): Promise<string>;

  abstract getProfileByUserId(userId: string): Promise<UserProfile | null>;

  abstract getProfiles(options?: {
    userId?: string;
    fuzzy?: boolean;
    mainTopic?: string[];
    subTopic?: string[];
    topicValue?: string[];
    limit?: number;
    offset?: number;
  }): Promise<UserProfile[]>;

  abstract deleteProfile(profileId: string): Promise<boolean>;

  abstract countProfiles(userId?: string, fuzzy?: boolean): Promise<number>;

  abstract close(): Promise<void>;
}

export type UserProfileStore = UserProfileStoreBase;
