/**
 * User profile store factory.
 * Port of Python powermem/user_memory/storage/factory.py.
 */
import { UserProfileStoreBase } from './base.js';
import { SQLiteUserProfileStore } from './user-profile-sqlite.js';

void SQLiteUserProfileStore;

export class UserProfileStoreFactory {
  static create(providerName: string, config: Record<string, unknown> = {}): UserProfileStoreBase {
    const StoreClass = UserProfileStoreBase.getProviderConstructor(providerName);
    if (!StoreClass) {
      const supportedProviders = UserProfileStoreBase.getSupportedProviders().join(', ');
      throw new Error(
        `Unsupported UserProfileStore provider: ${providerName}. ` +
        `Currently supported providers are: ${supportedProviders}.`,
      );
    }
    return new StoreClass(config);
  }
}
