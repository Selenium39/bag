const axios = require('axios');
const { load } = require('cheerio');
const { resolve } = require('url')
const { blue } = require('chalk');
const fsPromise = require('fs/promises');
const { join } = require('path');
const { table, parallelFetch } = require('./util');
const readline = require('readline');
const os = require('os');

const DEFAULT_HEADERS = {
    connection: 'keep-alive',
    'cache-control': 'max-age=0',
    'sec-ch-ua': 'Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6'
}


function getDataDir() {
    const homeDir = os.homedir();
    const dataDir = join(homeDir, '.bqg_novel_reader_data', 'data');
    return fsPromise.mkdir(dataDir, { recursive: true })
        .then(() => dataDir)
        .catch(error => {
            console.error('创建数据目录时发生错误:', error);
            process.exit(1);
        });
}


async function getFilePath(input) {
    let novelName = input;
    const dataDir = await getDataDir();
    if (!isNaN(input)) { // 如果输入的值是序号
        const index = parseInt(input, 10) - 1;
        const files = await fsPromise.readdir(dataDir, { withFileTypes: true });
        const novels = files.filter(file => file.isFile() && file.name.endsWith('.txt'));
        if (index >= 0 && index < novels.length) {
            novelName = novels[index].name.replace('.txt', '');
        } else {
            console.log(blue(`序号 ${input} 超出范围，请输入有效序号。`));
            return;
        }
    }
    const filePath = join(dataDir, `${novelName}.txt`);
    return filePath
}

function paginate(text, pageSize) {
    const lines = text.split('\n');
    let start = 0;
    let end = pageSize;

    return function (direction) {
        if (direction === 'down') start = Math.min(start + pageSize, lines.length - pageSize);
        if (direction === 'up') start = Math.max(start - pageSize, 0);
        end = Math.min(start + pageSize, lines.length);

        console.clear();
        console.log(lines.slice(start, end).join('\n'));
    };
}


// 添加小说
async function addNovel(url, options) {
    // 1. 获取小说名和目录
    const catalogRes = await axios.get(url, { headers: DEFAULT_HEADERS });
    const catalogPage = load(catalogRes.data);
    const title = catalogPage('h1').text();
    const catalogues = Array.from(catalogPage('#list a').map((index, item) => {
        return { index, href: resolve(url, catalogPage(item).attr('href')), title: catalogPage(item).text() };
    }));
    console.info(`已完成 ${blue(title)} 书籍的目录获取,共有 ${blue(catalogues.length)} 章`);

    // 并发获取小说章节内容
    const contents = [];
    const tasks = catalogues.map(({ href, title: chapterTitle }, i) => async () => {
        const res = await axios.get(href, { headers: DEFAULT_HEADERS, referer: url });
        const page = load(res.data.replace(/<br\/>/g, '\n'));
        const content = page('#content').text().replace(/app2\(\);([\s\S]+)app2\(\);[\s\S]+/, '$1');
        contents.push({ index: i, title: chapterTitle, content });
        console.info(`第 ${blue(i + 1)} 章获取完成,本章共 ${blue(content.length)} 字数`)
        return { index: i, title: chapterTitle, content };
    });
    const concurrency = parseInt(options.concurrency, 10) || 1;
    await parallelFetch(tasks, concurrency);

    // 按照章节排序，避免并发下章节顺序不对
    const sortedContents = contents.sort((a, b) => a.index - b.index);

    // 保存小说
    let novelContent = sortedContents.map(({ index, title, content }) => `
  ### ${index + 1} ${title}
  ${content}
  `).join('\n');
    const dataDir = await getDataDir();
    await fsPromise.writeFile(join(dataDir, `${title}.txt`), novelContent, 'utf-8');
}


// 显示小说列表
async function listNovel() {
    try {
        const dataDir = await getDataDir();
        const files = await fsPromise.readdir(dataDir, { withFileTypes: true });

        const novels = files
            .filter(file => file.isFile() && file.name.endsWith('.txt'))
            .map((file, index) => ({
                '序号': index + 1,
                '小说名称': file.name.replace('.txt', '')
            }));

        if (novels.length > 0) {
            table(novels);
        } else {
            console.log('没有找到任何小说。');
        }
    } catch (error) {
        console.error('读取小说列表时发生错误:', error);
    }
}

// 阅读小说
async function readNovel(input, chapterIndex = 1) {
    const filePath = await getFilePath(input);

    try {
        const content = await fsPromise.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        let chaptersStartLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.trimStart().startsWith('###')).map(({ index }) => index);

        let currentChapterIndex = Math.max(0, Math.min(chaptersStartLines.length - 1, chapterIndex - 1));
        let currentPageStartLine = chaptersStartLines[currentChapterIndex];
        let currentPageEndLine = chaptersStartLines[currentChapterIndex + 1] || lines.length;

        const pageSize = process.stdout.rows - 4;
        let currentLine = currentPageStartLine;

        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        const displayCurrentPage = () => {
            console.clear();
            for (let i = currentLine; i < Math.min(currentLine + pageSize, currentPageEndLine); i++) {
                console.log(lines[i]);
            }
            console.log(blue('按⬇翻页, 按⬆返回上页,按下Q退出阅读。'));
        };

        process.stdin.on('keypress', (_, key) => {
            if (key.name === 'q') {
                process.exit();
            } else if (key.name === 'down') {
                if (currentLine + pageSize < currentPageEndLine) {
                    currentLine += pageSize; // Move down within the chapter
                } else if (currentChapterIndex < chaptersStartLines.length - 1) {
                    currentChapterIndex++; // Move to the next chapter
                    currentPageStartLine = chaptersStartLines[currentChapterIndex];
                    currentPageEndLine = chaptersStartLines[currentChapterIndex + 1] || lines.length;
                    currentLine = currentPageStartLine;
                }
                displayCurrentPage();
            } else if (key.name === 'up') {
                if (currentLine > currentPageStartLine) {
                    currentLine = Math.max(currentPageStartLine, currentLine - pageSize); // Move up within the chapter
                } else if (currentChapterIndex > 0) {
                    currentChapterIndex--; // Move to the previous chapter
                    currentPageStartLine = chaptersStartLines[currentChapterIndex];
                    currentPageEndLine = chaptersStartLines[currentChapterIndex + 1] || lines.length;
                    currentLine = Math.max(currentPageStartLine, currentPageEndLine - pageSize);
                }
                displayCurrentPage();
            }
        });

        displayCurrentPage();
    } catch (error) {
        console.error('读取小说时发生错误:', error.message);
    }
}



// 查看小说章节
async function listChapters(novelName) {
    const filePath = await getFilePath(novelName);

    try {
        const content = await fsPromise.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trimStart().startsWith('###'));
        const chapters = lines.map((line, index) => {
            const chapterRegex = /^\s*#+\s*(\d+)\s+(.*)$/;
            const match = line.match(chapterRegex);
            return match ? `${match[1]}. ${match[2]}` : `Chapter ${index + 1}`;
        });

        let currentPage = 0;
        const pageSize = 20; // 定义每页显示多少章节
        const totalPages = Math.ceil(chapters.length / pageSize);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);

        const displayPage = (page) => {
            console.clear();
            const start = page * pageSize;
            const end = start + pageSize;
            chapters.slice(start, end).forEach(chapter => {
                console.log(chapter);
            });
            console.log(blue(`按⬇ 翻页, 按⬆ 返回上页, 按Q退出。页码：${page + 1} / ${totalPages}`));
        };

        const handleKeypress = (str, key) => {
            if (key.name === 'q') {
                process.stdin.removeListener('keypress', handleKeypress);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                rl.close();
                console.clear();
                return;
            } else if (key.name === 'down') {
                if (currentPage < totalPages - 1) {
                    currentPage++;
                    displayPage(currentPage);
                }
            } else if (key.name === 'up') {
                if (currentPage > 0) {
                    currentPage--;
                    displayPage(currentPage);
                }
            }
        };

        process.stdin.on('keypress', handleKeypress);

        displayPage(currentPage);
    } catch (error) {
        console.error('列出章节时发生错误:', error.message);
    }
}





module.exports = {
    addNovel,
    listNovel,
    readNovel,
    listChapters
}