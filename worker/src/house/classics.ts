// A small set of classic recipes from her era that fit a Seventh-day Adventist
// table: all vegan (so they suit vegetarian and vegan days alike), and nothing
// with meat, gelatin, alcohol or coffee. They're written here by hand, never
// generated, and arrive in the Studio as DRAFTS: family approves each one, and
// her iPad labels them "A classic recipe", never as hers.

import type { Recipe } from './kitchen.js';

type Classic = Pick<Recipe, 'title' | 'story' | 'servings' | 'ingredients' | 'steps'>;

const c = (text: string, amount: string | null = null) => ({ text, amount, source: 'classic' as const });
const s = (text: string, care: Recipe['steps'][number]['care'] = null, timer_minutes: number | null = null) => ({
  text,
  care,
  timer_minutes,
  source: 'classic' as const,
});

export const CLASSIC_RECIPES: Classic[] = [
  {
    title: 'Haystacks',
    story: 'A church potluck favorite: everyone builds their own plate.',
    servings: '4 plates',
    ingredients: [
      c('corn chips', '4 handfuls'),
      c('cooked pinto or kidney beans, warmed', '2 cans'),
      c('shredded lettuce', '2 cups'),
      c('chopped tomatoes', '2'),
      c('sliced black olives', '1 small can'),
      c('salsa', 'to taste'),
    ],
    steps: [
      s('Warm the beans in a pot on the stove.', 'stove_on'),
      s('Turn the stove off.', 'heat_off'),
      s('Put a handful of corn chips on each plate.'),
      s('Spoon the warm beans over the chips.', 'hot'),
      s('Add lettuce, tomatoes and olives on top.'),
      s('Finish with a spoonful of salsa.'),
    ],
  },
  {
    title: 'Lentil soup',
    story: 'A warm, simple soup for a cool evening.',
    servings: '6 bowls',
    ingredients: [
      c('dry lentils, rinsed', '1 cup'),
      c('onion, chopped', '1'),
      c('carrots, sliced', '2'),
      c('celery stalks, sliced', '2'),
      c('can of crushed tomatoes', '1'),
      c('water', '6 cups'),
      c('salt', '1 teaspoon'),
    ],
    steps: [
      s('Chop the onion, carrots and celery.', 'knife'),
      s('Put everything in a big pot.'),
      s('Bring it to a boil on the stove.', 'stove_on'),
      s('Turn it down low and let it simmer until the lentils are soft.', null, 40),
      s('Turn the stove off.', 'heat_off'),
      s('Ladle the soup into bowls. It will be hot.', 'hot'),
    ],
  },
  {
    title: 'Peach cobbler',
    story: 'Sweet peaches under a golden, soft topping.',
    servings: '8 helpings',
    ingredients: [
      c('sliced peaches, drained', '2 large cans'),
      c('flour', '1 cup'),
      c('sugar', '3/4 cup'),
      c('baking powder', '2 teaspoons'),
      c('plant milk', '3/4 cup'),
      c('vegetable oil', '1/4 cup'),
      c('cinnamon', '1 teaspoon'),
    ],
    steps: [
      s('Turn the oven on to 350 degrees.', 'oven_on'),
      s('Spread the peaches in a baking dish and sprinkle with cinnamon.'),
      s('In a bowl, stir together the flour, sugar and baking powder.'),
      s('Stir in the plant milk and oil until smooth.'),
      s('Pour the batter over the peaches.'),
      s('Bake until golden on top.', 'hot', 45),
      s('Take it out with oven mitts. It will be very hot.', 'hot'),
      s('Turn the oven off.', 'heat_off'),
    ],
  },
  {
    title: 'Oatmeal raisin cookies',
    story: 'A cookie jar classic.',
    servings: 'About 24 cookies',
    ingredients: [
      c('rolled oats', '2 cups'),
      c('flour', '1 cup'),
      c('brown sugar', '3/4 cup'),
      c('raisins', '3/4 cup'),
      c('baking soda', '1/2 teaspoon'),
      c('cinnamon', '1 teaspoon'),
      c('applesauce', '1/2 cup'),
      c('vegetable oil', '1/3 cup'),
    ],
    steps: [
      s('Turn the oven on to 350 degrees.', 'oven_on'),
      s('Mix the oats, flour, sugar, baking soda and cinnamon in a big bowl.'),
      s('Stir in the applesauce and oil.'),
      s('Fold in the raisins.'),
      s('Drop spoonfuls onto a baking sheet.'),
      s('Bake until the edges are golden.', 'hot', 12),
      s('Take the sheet out with oven mitts.', 'hot'),
      s('Turn the oven off.', 'heat_off'),
    ],
  },
  {
    title: 'Ambrosia fruit salad',
    story: 'No stove needed: a bright fruit salad for any day.',
    servings: '6 bowls',
    ingredients: [
      c('oranges, peeled and in pieces', '3'),
      c('pineapple chunks, drained', '1 can'),
      c('bananas, sliced', '2'),
      c('shredded coconut', '1/2 cup'),
      c('grapes', '1 cup'),
    ],
    steps: [
      s('Peel the oranges and pull them into pieces.'),
      s('Slice the bananas.', 'knife'),
      s('Put all the fruit in a big bowl.'),
      s('Sprinkle the coconut over the top.'),
      s('Stir gently and enjoy.'),
    ],
  },
  {
    title: 'Skillet cornbread',
    story: 'Golden cornbread to go with soup or beans.',
    servings: '8 pieces',
    ingredients: [
      c('cornmeal', '1 cup'),
      c('flour', '1 cup'),
      c('sugar', '1/4 cup'),
      c('baking powder', '1 tablespoon'),
      c('salt', '1/2 teaspoon'),
      c('plant milk', '1 cup'),
      c('vegetable oil', '1/3 cup'),
    ],
    steps: [
      s('Turn the oven on to 400 degrees.', 'oven_on'),
      s('Mix the cornmeal, flour, sugar, baking powder and salt.'),
      s('Stir in the plant milk and oil.'),
      s('Pour into an oiled baking pan.'),
      s('Bake until golden.', 'hot', 22),
      s('Take it out with oven mitts.', 'hot'),
      s('Turn the oven off.', 'heat_off'),
    ],
  },
];
