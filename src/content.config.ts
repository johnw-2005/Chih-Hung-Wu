import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { schemas } from './lib/content-schemas.mjs';

const profile = defineCollection({
  loader: glob({ base: './src/content', pattern: 'profile.yaml' }),
  schema: schemas.profile,
});

const lab = defineCollection({
  loader: glob({ base: './src/content', pattern: 'lab.yaml' }),
  schema: schemas.lab,
});

const photos = defineCollection({
  loader: file('./src/content/photos.yaml'),
  schema: schemas.photos,
});

const publications = defineCollection({
  loader: file('./src/content/publications.yaml'),
  schema: schemas.publications,
});

const projects = defineCollection({
  loader: file('./src/content/projects.yaml'),
  schema: schemas.projects,
});

const graduates = defineCollection({
  loader: file('./src/content/graduates.yaml'),
  schema: schemas.graduates,
});

const awards = defineCollection({
  loader: file('./src/content/awards.yaml'),
  schema: schemas.awards,
});

const services = defineCollection({
  loader: file('./src/content/services.yaml'),
  schema: schemas.services,
});

const academics = defineCollection({
  loader: file('./src/content/academics.yaml'),
  schema: schemas.academics,
});

const honors = defineCollection({
  loader: file('./src/content/honors.yaml'),
  schema: schemas.honors,
});

export const collections = {
  profile,
  lab,
  photos,
  publications,
  projects,
  graduates,
  awards,
  services,
  academics,
  honors,
};
