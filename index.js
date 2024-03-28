#!/usr/bin/env node
const { Command } = require('commander');
const { addNovel,listNovel,readNovel,listChapters } = require('./lib/novel');
const pkg = require('./package.json') 
const program = new Command();

program
  .version(pkg.version)
  .description(pkg.description);

program
  .command('add <url>')
  .description('通过网页链接添加小说')
  .option('-c, --concurrency <number>', '指定下载的并发数', '1') 
  .action(addNovel);

program
  .command('list')
  .description('列出所有小说')
  .action(listNovel);

program
  .command('read <novelName> [chapterIndex]')
  .description('阅读指定的小说')
  .action(readNovel);

program
  .command('chapters <novelName>')
  .description('列出指定小说的所有章节')
  .action(listChapters);

program.parse(process.argv);
