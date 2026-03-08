declare namespace chrome {
  namespace storage {
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }
    namespace local {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
      function remove(keys: string | string[]): Promise<void>;
    }
    namespace session {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
      function remove(keys: string | string[]): Promise<void>;
      function setAccessLevel(accessLevel: { accessLevel: string }): Promise<void>;
    }
    namespace onChanged {
      function addListener(
        callback: (changes: Record<string, StorageChange>, areaName: string) => void
      ): void;
    }
  }

  namespace alarms {
    interface Alarm {
      name: string;
    }
    function create(name: string, info: { periodInMinutes: number }): void;
    namespace onAlarm {
      function addListener(callback: (alarm: Alarm) => void): void;
    }
  }

  namespace runtime {
    namespace onInstalled {
      function addListener(callback: () => void): void;
    }
    namespace onMessage {
      function addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    }
    function getURL(path: string): string;
    function sendMessage(message: unknown): Promise<unknown>;
  }

  namespace tabs {
    function create(properties: { url?: string; active?: boolean }): Promise<unknown>;
  }
}
