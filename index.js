const { Command } = require('commander');
const { addNovel,listNovel,readNovel } = require('./lib/novel');
const program = new Command();

// node index.js add https://www.xbiqugu.info/114/114545/ 

program
  .version('0.1.0')
  .description('bqg: 笔趣阁小说命令行阅读器');

program
  .command('add <url>')
  .description('通过网页链接添加小说')
  .action(addNovel);

program
  .command('list')
  .description('列出所有小说')
  .action(listNovel);

  program
  .command('read <novelName>')
  .description('阅读指定的小说')
  .action(readNovel);

program.parse(process.argv);
