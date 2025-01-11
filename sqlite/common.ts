export type PersistedMessage = {
  /** ULID */
  id: string;

  createdAt: string;

  /** Soft-delete after successful processing */
  deletedAt?: string;

  /** JSON message content */
  content: string;
};
