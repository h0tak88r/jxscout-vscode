# jxscout-vscode

A VSCode extension for integrating with [jxscout](https://github.com/francisconeves97/jxscout), a tool that automatically saves JS files and extracts relevant code for security research.

## Features

- **Workspace Matchers** — automatically scans all JS/HTML files in your project and shows every matcher found across every file, grouped by file
- **Toggle grouping** — switch between "By File" and "By Match" views in the Workspace Matchers panel using the title bar button
- **File-level Descriptors** — browse matchers (paths, hostnames, endpoints, etc.) for the currently open file
- **Navigate to match** — click any match to open the exact line in the source file
- **Copy tools** — copy values, paths, hostnames, and query parameters for brute-forcing
- **Project-wide analysis** — toggle between file-level and project-level views

## Demo

https://github.com/user-attachments/assets/b32294ff-8942-46eb-9033-2e2632818787

## Installation

1. Download the latest `.vsix` file from the [releases](https://github.com/h0tak88r/jxscout-vscode/releases) page
2. In VSCode, open the extensions sidebar menu
3. Click the three dots at the top and select "Install from VSIX..."
4. Select the `.vsix` file you just downloaded

![install](./docs/install.png)

## Configuration

The extension can be configured through VSCode settings:

| Setting              | Description                              | Default     |
| -------------------- | ---------------------------------------- | ----------- |
| `jxscout.serverHost` | Hostname of the jxscout WebSocket server | `localhost` |
| `jxscout.serverPort` | Port of the jxscout WebSocket server     | `3333`      |

## Usage

1. Open a workspace folder in VSCode
2. The extension automatically connects to the jxscout server and loads **Workspace Matchers** for all JS/HTML files
3. Click any match to jump to the exact line in that file
4. Use the **Workspace Matchers** view to browse all findings across the project
5. Use the **Descriptors (File)** view to focus on the currently open file
6. Right-click matches to copy values, paths, hostnames, or query parameters

## Requirements

- A running jxscout server (version >=0.7.0)

## Building from source

```sh
npm install
npm run compile
npx vsce package
```

## License

This project is licensed under the GNU General Public License. See the COPYING file for the full license text.

## Contributing

Feel free to leave suggestions and open pull requests — all contributions are welcome!

## Support

Happy hunting! 🐛 If jxscout helped you find cool bugs, [consider buying me a coffee](https://ko-fi.com/francisconeves97)! ☕
