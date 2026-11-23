export * from './config.js';
export * from './resolve.js';
export * from './load.js';
export * from './translator.js';
export { CATALOGS, type Messages, type Namespace } from './messages/index.js';

import type { MessageKeys, NestedKeyOf } from 'use-intl/core';
import type { Messages, Namespace } from './messages/index.js';

/** Alle gültigen Schlüssel eines Namespace, z. B. `MessageKey<'api'>` → 'signup.shiftFull' | … */
export type MessageKey<N extends Namespace> = MessageKeys<Messages[N], NestedKeyOf<Messages[N]>>;
