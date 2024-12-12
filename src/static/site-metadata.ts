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
  siteTitle: 'Running 🏃‍',
  siteUrl: 'https://run.viazure.cc',
  logo: 'https://avatars.githubusercontent.com/u/9543636?v=4&size=225',
  description: '想不明白的事情那么多，想到就能做的事情太少了。',
  navLinks: [
    {
      name: 'About',
      url: 'https://github.com/viazure',
    },
  ],
};

export default data;
