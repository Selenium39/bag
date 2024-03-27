const axios = require('axios');
const { load } = require('cheerio');
const { resolve } = require('url')
const { blue } = require('chalk');
const fsPromise = require('fs/promises');
const { join } = require('path');
const { table } = require('./util');
const readline = require('readline');

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

// 获取小说名和目录
async function getNovelInfo(url) {
    const htmlRes = await axios.get(url, {
        headers: DEFAULT_HEADERS
    })
    const $ = await load(htmlRes.data);
    const title = $('h1').text();
    const catalogues = Array.from($('#list a').map((index, item) => {
        const $item = $(item);
        const href = resolve(url, $item.attr('href'));
        return { index, href, title: $item.text() }
    }))
    console.info(`已完成 ${blue(title)} 书籍的目录获取,共有 ${blue(catalogues.length)} 章`)
    return { title, catalogues };
}

// 获取小说内容
async function getNovelContent(url, catalogues) {
    const contents = []
    for (let i = 0; i < catalogues.length; i++) {
        const { index, href, title } = catalogues[i];
        const htmlRes = await axios.get(href, {
            headers: DEFAULT_HEADERS,
            referer: url
        })
        const $ = await load(htmlRes.data.replace(/<br\/>/g, '\n'));
        const content = Array.from($('#content')).map((item) => {
            $item = $(item);
            return $item.text()
        }).join('\n').replace(/app2\(\);([\s\S]+)app2\(\);[\s\S]+/, '$1');
        contents.push({ index, title, content });
        console.info(`第 ${blue(i + 1)} 章获取完成,本章共 ${blue(content.length)} 字数,还剩 ${blue(catalogues.length - i - 1)} 章`)
    }
    return contents;
}

// 保存小说
async function saveNodel(bookTitle, contents) {
    let content = contents.map(({ index, title, content }) => `
    ### ${index + 1} ${title}
    ${content}
    `)
    await fsPromise.writeFile(join(process.cwd(), 'data', `${bookTitle}.txt`), content, 'utf-8');
}



// 添加小说
async function addNovel(url) {
    const { title, catalogues } = await getNovelInfo(url);
    const contents = await getNovelContent(url, catalogues);
    await saveNodel(title, contents)
}

// 显示小说列表
async function listNovel() {
    const novelDir = join(process.cwd(), 'data');
    try {
        const files = await fsPromise.readdir(novelDir, { withFileTypes: true });

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

// 阅读小说
async function readNovel(novelName) {
    const filePath = join(process.cwd(), 'data', `${novelName}.txt`);

    try {
        const content = await fsPromise.readFile(filePath, 'utf8');
        const pageSize = process.stdout.rows - 4;
        const page = paginate(content, pageSize);
        page();

        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        console.log(blue('按⬇来翻页,按下Q退出阅读。'));

        process.stdin.on('keypress', (str, key) => {
            if (key.ctrl && key.name === 'c' || key.name === 'q') {
                process.exit();
            } else if (key.name === 'down') {
                page('down');
            } else if (key.name === 'up') {
                page('up');
            }
        });
    } catch (error) {
        console.error('读取小说时发生错误:', error.message);
    }
}



module.exports = {
    addNovel,
    listNovel,
    readNovel
}