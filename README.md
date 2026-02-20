# 🛒 Discord Shop Bot

**A powerful and customizable Discord bot to run your own shop directly in your server.**

This open-source Discord bot provides a complete solution for managing an online store within your Discord community. It allows users to browse items, place orders, and submit payment proofs, while giving shop managers the tools to confirm, process, and manage every order efficiently.

## ✨ Features

- **🛍️ Item Browser:** Users can easily navigate through categories and view items in a structured and user-friendly way.
- **🛒 Seamless Ordering:** A simple and intuitive process for users to place orders directly from the item listings.
- **🧾 Payment Proof Upload:** Customers can upload payment proofs for their orders, which are then sent to the managers for review.
- **🔒 Secure Order Channels:** Each order automatically creates a private channel for communication between the customer and shop managers.
- **🗂️ Order Management:** Shop managers can confirm, reject, or mark orders as complete, with all actions logged in dedicated history channels.
- **🔔 Real-time Notifications:** Both users and managers receive real-time updates on order status changes.
- **⚙️ Highly Customizable:** Easily configure channel IDs, roles, and other settings in the `config.ts` file.

## 🚀 Technologies Used

- **[Node.js](https://nodejs.org/)** - JavaScript runtime environment
- **[TypeScript](https://www.typescriptlang.org/)** - Typed superset of JavaScript
- **[Discord.js](https://discord.js.org/)** - Powerful library for interacting with the Discord API
- **[Bun](https://bun.sh/)** - Fast JavaScript all-in-one toolkit (used for running the project)

## 🔧 Installation & Setup

Follow these steps to get the bot up and running on your server.

### 1. Clone the Repository

```bash
git clone https://github.com/irfankurniawansuthiono/discord-shop-bot.git
cd discord-shop-bot
```

### 2. Install Dependencies

This project uses Bun for package management.

```bash
bun install
```
### 3. Configure Environment Variables
1. Create a `.env` file in the root directory of the project.

```bash
touch .env
```

2. Add the following environment variables to the `.env` file:

```bash
BOT_TOKEN=
BOT_APP_ID=
BOT_PUBLIC_KEY=
```

3. Replace `BOT_TOKEN`, `BOT_APP_ID`, and `BOT_PUBLIC_KEY` with your actual values.

Follow the [Discord Developer Portal](https://discord.com/developers/applications) to create a new Discord bot and obtain its token, App ID.

### 4. Configure the Bot

All configuration is handled in the `config.ts` file. You'll need to set up the necessary IDs and tokens.

1.  **Rename `config.example.ts` to `config.ts`** (if `config.ts` does not exist).
2.  Open `config.ts` and fill in the following values:
    - `BOT_TOKEN`: Your Discord bot token.
    - `GUILD_ID`: The ID of your Discord server.
    - `ORDER_CATEGORY_ID`: The category where new order channels will be created.
    - `...` and all other required IDs for channels and roles.

*You can find these IDs by enabling Developer Mode in Discord, right-clicking on a server, channel, or role, and selecting "Copy ID".*

### 5. Run the Bot

Once configured, you can start the bot using:

```bash
bun run index.ts
```

## 🤖 Usage

-   `/shop`: The main command to open the shop menu and start browsing.

From the shop menu, users can navigate through categories, select items, and proceed with their purchase.

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features, bug fixes, or improvements, feel free to:

1.  **Fork the repository.**
2.  **Create a new branch** (`git checkout -b feature/YourFeature`).
3.  **Make your changes.**
4.  **Commit your changes** (`git commit -m 'feat: Add some feature'`).
5.  **Push to the branch** (`git push origin feature/YourFeature`).
6.  **Open a Pull Request.**

Please ensure your code follows the existing style and conventions.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.
