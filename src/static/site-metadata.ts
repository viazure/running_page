interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'Running‍ Page',
  siteUrl: 'https://run.viazure.cc',
  logo: 'https://avatars.githubusercontent.com/u/9543636?v=4&size=225',
  description: '想不明白的事情那么多，想到就能做的事情太少了。 —— 关于跑步',
  navLinks: [
    {
      name: 'Summary',
      url: '/summary',
    },
    {
      name: 'Blog',
      url: 'https://viazure.cc',
    },
    {
      name: 'About',
      url: 'https://github.com/yihong0618/running_page/blob/master/README-CN.md',
    },
  ],
};

export default data;
