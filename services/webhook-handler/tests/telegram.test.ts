import {
  isPhotoMessage,
  isCommand,
  getBestPhoto,
  extractTaskPayload,
  isValidUpdate,
} from '../src/services/telegram.service';
import type { TelegramUpdate, TelegramPhotoSize } from '../../../shared/types';

describe('Telegram Utilities', () => {
  const mockPhoto: TelegramPhotoSize = {
    file_id: 'photo_123',
    file_unique_id: 'unique_123',
    width: 1920,
    height: 1080,
    file_size: 500000,
  };

  const mockSmallPhoto: TelegramPhotoSize = {
    file_id: 'photo_small',
    file_unique_id: 'unique_small',
    width: 320,
    height: 240,
    file_size: 10000,
  };

  const mockUpdate: TelegramUpdate = {
    update_id: 123456,
    message: {
      message_id: 1,
      date: 1704067200, // 2024-01-01 00:00:00
      chat: {
        id: 12345,
        type: 'group',
        title: 'Test Group',
      },
      from: {
        id: 67890,
        is_bot: false,
        first_name: 'John',
        username: 'johndoe',
      },
      photo: [mockSmallPhoto, mockPhoto],
    },
  };

  describe('isPhotoMessage', () => {
    it('should return true for updates with photos', () => {
      expect(isPhotoMessage(mockUpdate)).toBe(true);
    });

    it('should return false for updates without photos', () => {
      const textUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'private' },
          text: 'Hello',
        },
      };
      expect(isPhotoMessage(textUpdate)).toBe(false);
    });

    it('should return false for empty photo array', () => {
      const emptyPhotoUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'private' },
          photo: [],
        },
      };
      expect(isPhotoMessage(emptyPhotoUpdate)).toBe(false);
    });
  });

  describe('isCommand', () => {
    it('should return true for command messages', () => {
      const commandUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'private' },
          text: '/start',
        },
      };
      expect(isCommand(commandUpdate)).toBe(true);
    });

    it('should return false for regular text', () => {
      const textUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'private' },
          text: 'Hello',
        },
      };
      expect(isCommand(textUpdate)).toBe(false);
    });
  });

  describe('getBestPhoto', () => {
    it('should return the largest photo by file_size', () => {
      const photos = [mockSmallPhoto, mockPhoto];
      expect(getBestPhoto(photos)).toBe(mockPhoto);
    });

    it('should throw for empty array', () => {
      expect(() => getBestPhoto([])).toThrow('No photos provided');
    });

    it('should use dimensions if file_size not available', () => {
      const photoNoSize: TelegramPhotoSize = {
        file_id: 'photo_big',
        file_unique_id: 'unique_big',
        width: 3840,
        height: 2160,
      };
      const photos = [mockSmallPhoto, photoNoSize];
      expect(getBestPhoto(photos)).toBe(photoNoSize);
    });
  });

  describe('extractTaskPayload', () => {
    it('should extract payload from photo message', () => {
      const payload = extractTaskPayload(mockUpdate);
      expect(payload).toEqual({
        chatId: 12345,
        messageId: 1,
        fileId: 'photo_123', // Best photo
        uploaderUsername: 'johndoe',
        uploaderFirstName: 'John',
        chatTitle: 'Test Group',
        receivedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should return null for non-photo messages', () => {
      const textUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'private' },
          text: 'Hello',
        },
      };
      expect(extractTaskPayload(textUpdate)).toBeNull();
    });

    it('should handle missing user info', () => {
      const anonymousUpdate: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          date: 1704067200,
          chat: { id: 12345, type: 'group', title: 'Test' },
          photo: [mockPhoto],
        },
      };
      const payload = extractTaskPayload(anonymousUpdate);
      expect(payload?.uploaderUsername).toBe('unknown');
      expect(payload?.uploaderFirstName).toBe('Unknown');
    });
  });

  describe('isValidUpdate', () => {
    it('should return true for valid update', () => {
      expect(isValidUpdate(mockUpdate)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidUpdate(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidUpdate('string')).toBe(false);
      expect(isValidUpdate(123)).toBe(false);
    });

    it('should return false for object without update_id', () => {
      expect(isValidUpdate({ message: {} })).toBe(false);
    });
  });
});
