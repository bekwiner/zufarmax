const { Telegraf, Markup } = require("telegraf");

function createBot({ token, webAppUrl, adminWebAppUrl, adminChatId, isAdmin, onReferral, getMandatoryChannels }) {
  const bot = new Telegraf(token);
  let cachedBotUsername = null;

  const isValidHttpsWebAppUrl = (() => {
    try {
      const u = new URL(webAppUrl);
      return u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  const mainMenuRows = [
    [Markup.button.callback("Yordam", "help")]
  ];

  if (isValidHttpsWebAppUrl) {
    mainMenuRows.unshift([Markup.button.webApp("Web Appni ochish", webAppUrl)]);
  }

  const mainMenu = Markup.inlineKeyboard(mainMenuRows);
  const miniAppKeyboard = isValidHttpsWebAppUrl
    ? Markup.keyboard([[Markup.button.webApp("Mini Appni ochish", webAppUrl)]])
      .resize()
      .persistent()
    : null;

  const sanitizeChannel = (item = {}) => {
    const title = String(item?.title || "").trim();
    const urlRaw = String(item?.url || "").trim();
    const usernameFromUrl = (() => {
      const m = urlRaw.match(/t\.me\/([A-Za-z0-9_]{4,})/i);
      return m ? String(m[1]).trim() : "";
    })();
    const usernameRaw = String(item?.username || usernameFromUrl || "").trim().replace(/^@+/, "");
    const username = usernameRaw ? `@${usernameRaw}` : "";
    const url = urlRaw || (usernameRaw ? `https://t.me/${usernameRaw}` : "");
    return {
      id: String(item?.id || ""),
      title,
      username,
      url,
      active: item?.active !== false
    };
  };

  const getActiveMandatoryChannels = async () => {
    try {
      const rows = typeof getMandatoryChannels === "function" ? await getMandatoryChannels() : [];
      return (Array.isArray(rows) ? rows : [])
        .map((x) => sanitizeChannel(x))
        .filter((x) => x.active !== false && x.title && (x.username || x.url));
    } catch (error) {
      console.error("Mandatory channels load error:", error.message);
      return [];
    }
  };

  const isUserSubscribedToChannel = async (telegramId, channel) => {
    const target = channel.username || channel.url;
    if (!target) return true;
    try {
      const member = await bot.telegram.getChatMember(target, Number(telegramId));
      const status = String(member?.status || "").toLowerCase();
      return !["left", "kicked"].includes(status);
    } catch {
      return false;
    }
  };

  const getMissingSubscriptions = async (telegramId) => {
    const channels = await getActiveMandatoryChannels();
    if (!channels.length) return [];

    const missing = [];
    for (const ch of channels) {
      // Sequential check to avoid Telegram flood limits on free plans
      const ok = await isUserSubscribedToChannel(telegramId, ch);
      if (!ok) missing.push(ch);
    }
    return missing;
  };

  const buildSubscriptionKeyboard = (channels = []) => {
    const rows = channels.map((ch) => [
      Markup.button.url(`➕ ${ch.title}`, ch.url || `https://t.me/${String(ch.username || "").replace(/^@+/, "")}`)
    ]);
    rows.push([Markup.button.callback("✅ Obuna bo'ldim, tekshirish", "check_subscriptions")]);
    return Markup.inlineKeyboard(rows);
  };

  const sendSubscriptionRequired = async (ctx, channels = []) => {
    if (!channels.length) return false;
    const text = [
      "❗ Avval majburiy kanallarga obuna bo'ling.",
      "",
      "Pastdagi tugmalar orqali obuna bo'ling va keyin tekshirish tugmasini bosing."
    ].join("\n");
    await ctx.reply(text, buildSubscriptionKeyboard(channels));
    return true;
  };

  const sendWelcome = async (ctx) => {
    const text = [
      `Assalomu alaykum, ${ctx.from.first_name || "foydalanuvchi"}!`,
      "ZufarMax botiga xush kelibsiz.",
      "Pastdagi tugmalar orqali xizmatlardan foydalaning."
    ].join("\n");

    if (!isValidHttpsWebAppUrl) {
      await ctx.reply("Mini App tugmasi uchun WEB_APP_URL faqat https bo'lishi kerak.");
    }

    if (miniAppKeyboard) {
      await ctx.reply("Mini appni pastdagi tugmadan oching:", miniAppKeyboard);
    }

    await ctx.reply(text, mainMenu);
  };

  bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    if (payload && payload.startsWith("ref_")) {
      const referrerId = payload.replace("ref_", "");
      if (referrerId && String(ctx.from.id) !== referrerId) {
        await onReferral(referrerId, ctx.from.id, {
          firstName: ctx.from.first_name || "",
          lastName: ctx.from.last_name || "",
          username: ctx.from.username || ""
        });
      }
    }
    const missing = await getMissingSubscriptions(ctx.from.id);
    if (missing.length) {
      await sendSubscriptionRequired(ctx, missing);
      return;
    }

    await sendWelcome(ctx);
  });

  bot.action("check_subscriptions", async (ctx) => {
    await ctx.answerCbQuery("Tekshirilmoqda...");
    const missing = await getMissingSubscriptions(ctx.from?.id);
    if (missing.length) {
      await ctx.reply("Hali ham hamma kanalga obuna bo'lmagansiz.", buildSubscriptionKeyboard(missing));
      return;
    }
    await ctx.reply("✅ Obuna tasdiqlandi.");
    await sendWelcome(ctx);
  });

  bot.command("catalog", async (ctx) => {
    await ctx.reply("Kategoriya tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("Free Fire Olmos", "cat_diamonds")],
      [Markup.button.callback("PUBG UC", "cat_uc")],
      [Markup.button.callback("Standoff Gold", "cat_gold")],
      [Markup.button.callback("Telegram Xizmatlari", "cat_telegram")],
      [Markup.button.callback("Akkauntlar", "cat_accounts")]
    ]));
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("Yordam: @" + (process.env.SUPPORT_USERNAME || "ZufarMaxSupport"));
  });

  bot.command("admin", async (ctx) => {
    const telegramId = String(ctx.from?.id || "");
    if (!isAdmin || !isAdmin(telegramId)) {
      await ctx.reply("Admin panel faqat ruxsat berilgan foydalanuvchilar uchun.");
      return;
    }

    if (!adminWebAppUrl) {
      await ctx.reply("Admin panel URL topilmadi. ADMIN_WEB_APP_URL yoki WEB_APP_URL sozlang.");
      return;
    }

    const adminUrlWithVersion = (() => {
      try {
        const u = new URL(adminWebAppUrl);
        u.searchParams.set("v", "20260309-api-fix");
        return u.toString();
      } catch {
        return adminWebAppUrl;
      }
    })();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.webApp("Admin panelni ochish", adminUrlWithVersion)]
    ]);
    await ctx.reply("Admin panelga kirish uchun tugmani bosing:", keyboard);
  });

  bot.action("catalog", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("/catalog buyrug'ini bosing yoki quyidagini tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("Katalogni ochish", "cat_diamonds")]
    ]));
  });

  bot.action("help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Savol bo'lsa yozing: @" + (process.env.SUPPORT_USERNAME || "ZufarMaxSupport"));
  });

  const categoryMap = {
    cat_diamonds: "Free Fire Olmos",
    cat_uc: "PUBG UC",
    cat_gold: "Standoff Gold",
    cat_telegram: "Telegram Xizmatlari",
    cat_accounts: "Akkauntlar"
  };

  Object.entries(categoryMap).forEach(([action, title]) => {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      const rows = isValidHttpsWebAppUrl
        ? [[Markup.button.webApp("Web App orqali buyurtma", webAppUrl)]]
        : [];
      rows.push([Markup.button.callback("Orqaga", "catalog")]);
      await ctx.reply(`${title} uchun buyurtma berish:`, Markup.inlineKeyboard(rows));
    });
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  async function notifyNewOrder(order) {
    if (!adminChatId) return;

    const lines = [
      "Yangi buyurtma!",
      `Order ID: ${order.id}`,
      `User: ${order.telegramId}`,
      `Nomi: ${order.productTitle}`,
      `Narx: ${order.amount} UZS`,
      `UID: ${order.gameUid || "-"}`,
      `Nickname: ${order.playerNickname || "-"}`,
      `Status: ${order.status}`
    ];

    await bot.telegram.sendMessage(adminChatId, lines.join("\n"));
  }

  async function getBotUsername() {
    if (cachedBotUsername) return cachedBotUsername;

    try {
      const me = bot.botInfo || await bot.telegram.getMe();
      cachedBotUsername = me?.username || null;
      return cachedBotUsername;
    } catch (error) {
      console.error("Bot username resolve error:", error.message);
      return null;
    }
  }

  return { bot, notifyNewOrder, getBotUsername };
}

module.exports = { createBot };
