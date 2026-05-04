import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Appeal, AppealStatus } from './types.ts';

import nodemailer from 'nodemailer';

export async function sendReplyEmail(to: string, subject: string, text: string, config: any) {
  let host = config.host || 'smtp.gmail.com';
  
  // Улучшенная логика определения SMTP сервера
  if (host.includes('imap.gmail.com')) host = 'smtp.gmail.com';
  else if (host.includes('imap.mail.ru')) host = 'smtp.mail.ru';
  else if (host.includes('imap.yandex.ru')) host = 'smtp.yandex.ru';
  else if (host.includes('outlook.office365.com')) host = 'smtp.office365.com';
  else if (host.startsWith('imap.')) host = host.replace('imap.', 'smtp.');
  
  const user = (config.user || '').trim();
  const pass = (config.pass || '').trim();

  if (!user || !pass) {
    console.error('SMTP: Missing credentials - user length:', user.length, 'pass length:', pass.length);
    throw new Error('Учетные данные для SMTP не найдены (User/Pass). Пожалуйста, введите их в Настройках.');
  }

  // Очистка адреса получателя (извлекаем чистый email из "Name <email>")
  const cleanTo = to.includes('<') ? to.match(/<([^>]+)>/)?.[1] || to : to;

  console.log(`SMTP: Attempting send to ${cleanTo} via ${host}:465 with user ${user}`);

  const transporter = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: {
      user: user,
      pass: pass,
    },
    connectionTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      from: `"CitizenConnect" <${user}>`,
      to: cleanTo,
      subject: `Ответ на обращение: ${subject}`,
      text: text,
    });
  } catch (error: any) {
    console.error('SMTP 465 failed, trying 587...', error.message);
    
    // Пробуем альтернативный порт 587 (часто нужен для некоторых провайдеров)
    console.log(`SMTP: Retrying send to ${cleanTo} via ${host}:587`);
    const transporterTLS = nodemailer.createTransport({
      host,
      port: 587,
      secure: false,
      auth: {
        user: user,
        pass: pass,
      },
      connectionTimeout: 15000,
    });

    await transporterTLS.sendMail({
      from: `"CitizenConnect" <${user}>`,
      to: cleanTo,
      subject: `Ответ на обращение: ${subject}`,
      text: text,
    });
  }
}

export async function fetchLatestEmails(customConfig?: any): Promise<Appeal[]> {
  const host = customConfig?.host || process.env.EMAIL_HOST || 'imap.gmail.com';
  const port = parseInt(customConfig?.port || process.env.EMAIL_PORT || '993');
  const user = customConfig?.user?.trim() || process.env.EMAIL_USER?.trim() || '';
  const pass = customConfig?.pass?.trim() || process.env.EMAIL_PASS?.trim() || '';
  const secure = customConfig?.secure !== undefined ? customConfig.secure : (process.env.EMAIL_SECURE !== 'false');

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    logger: false,
    connectionTimeout: 40000,
    greetingTimeout: 40000,
    tls: {
      servername: host,
      rejectUnauthorized: false
    }
  });

  // Handle unexpected errors to prevent app crash
  client.on('error', err => {
    console.error('IMAP Global Error:', err);
  });

  const appeals: Appeal[] = [];

  try {
    if (!user || !pass) {
      throw new Error('EMAIL_USER или EMAIL_PASS не заполнены.');
    }

    console.log(`IMAP: Соединение с ${host}...`);
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
        const fullErr = JSON.stringify(err).toLowerCase();
        
        // Check for common authentication failure strings
        if (msg.includes('auth') || msg.includes('no [') || msg.includes('credential') || msg.includes('command failed') || fullErr.includes('authenticationfailed')) {
            throw new Error('ОШИБКА ВХОДА: Почтовый сервер отклонил ваш логин или пароль.\n\n' + 
                            '1. Обязательно используйте "Пароль Приложения" (16 знаков), а не обычный пароль.\n' +
                            '2. Gmail: В настройках почты (через браузер) Включите IMAP.\n' +
                            '3. Проверьте правильность написания Почты (логина).');
        }
        if (msg.includes('timeout') || msg.includes('econnrefused')) {
            throw new Error('ОШИБКА СЕТИ: Сервер почты не отвечает. Проверьте адрес (IMAP Host) или подождите немного.');
        }
        throw new Error(`ОШИБКА ПОДКЛЮЧЕНИЯ: ${err.message}`);
    }
    throw new Error('Неизвестная критическая ошибка при работе с почтой.');
  }

  return appeals;
}
