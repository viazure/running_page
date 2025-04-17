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

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: 'Running‍ Page',
  siteUrl: 'https://run.viazure.cc',
  logo: 'https://avatars.githubusercontent.com/u/9543636?v=4&size=225',
  description: '想不明白的事情那么多，想到就能做的事情太少了。',
  navLinks: [
    {
      name: 'Blog',
      url: 'https://viazure.cc',
    },
    {
      name: 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'About',
      url: 'https://github.com/yihong0618/running_page/blob/master/README-CN.md',
    },
  ],
};

export default data;
