import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Appeal, AppealStatus } from './types.ts';

export async function fetchLatestEmails(): Promise<Appeal[]> {
  const client = new ImapFlow({
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '993'),
    secure: process.env.EMAIL_SECURE !== 'false',
    auth: {
      user: process.env.EMAIL_USER?.trim() || '',
      pass: process.env.EMAIL_PASS?.trim() || '',
    },
    logger: false,
    connectionTimeout: 40000,
    greetingTimeout: 40000,
    tls: {
      servername: process.env.EMAIL_HOST || 'imap.gmail.com',
      rejectUnauthorized: false
    }
  });

  // Handle unexpected errors to prevent app crash
  client.on('error', err => {
    console.error('IMAP Global Error:', err);
  });

  const appeals: Appeal[] = [];

  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('EMAIL_USER или EMAIL_PASS не заполнены в Secrets.');
    }

    console.log(`IMAP: Соединение с ${process.env.EMAIL_HOST}...`);
    await client.connect();
    
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Ищем все UID сообщений
      const foundUids = await client.search({ all: true });
      const uids = Array.isArray(foundUids) ? foundUids : [];
      console.log(`IMAP: Всего найдено UID: ${uids.length}`);
      
      if (uids.length === 0) {
        console.log('IMAP: В папке INBOX нет сообщений.');
        return [];
      }

      // Берем последние 20 сообщений (самые свежие)
      const lastUids = uids.slice(-20);
      console.log(`IMAP: Загрузка контента для последних ${lastUids.length} UID...`);

      const messages = client.fetch(lastUids, {
        envelope: true,
        source: true,
      });

      for await (const message of messages) {
        try {
          const parsed = await simpleParser(message.source);
          appeals.push({
            id: message.uid.toString(),
            senderName: parsed.from?.value[0]?.name || parsed.from?.text || 'Неизвестный',
            senderEmail: parsed.from?.value[0]?.address || 'unknown@example.com',
            subject: parsed.subject || '(Без темы)',
            content: parsed.text || (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]*>?/gm, '') : '(Пустое сообщение)'),
            receivedAt: parsed.date?.toISOString() || new Date().toISOString(),
            status: AppealStatus.NEW,
            priority: 'MEDIUM'
          });
        } catch (parseErr) {
          console.error(`IMAP: Ошибка разбора письма UID ${message.uid}:`, parseErr);
        }
      }
      
      // Сортировка по дате (новые вверху)
      appeals.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
      console.log(`IMAP: Готово. Загружено: ${appeals.length} шт.`);
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('IMAP FATAL ERROR:', err);
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes('auth') || msg.includes('a1 no')) {
            throw new Error('ОШИБКА АВТОРИЗАЦИИ: Google отклонил пароль. Убедитесь, что вы используете 16-значный "Пароль Приложения", а не обычный пароль от почты.');
        }
        if (msg.includes('timeout') || msg.includes('econnrefused')) {
            throw new Error('ОШИБКА СЕТИ: Сервер почты не отвечает. Подождите 10 секунд и попробуйте снова.');
        }
        throw new Error(`ОШИБКА ПОДКЛЮЧЕНИЯ: ${err.message}`);
    }
    throw new Error('Неизвестная критическая ошибка при работе с почтой.');
  }

  return appeals;
}
