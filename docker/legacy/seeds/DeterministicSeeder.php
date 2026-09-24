<?php

use Illuminate\Database\Seeder;

/**
 * Semeia o oráculo com dados reproduzíveis (DUV-CON-007).
 *
 * Fica FORA de legacy/: o Dockerfile copia este arquivo para database/seeds da imagem.
 * Fixa a semente do mt_rand (usado por rand(), Collection::random() e pelo Faker) e
 * delega ao DatabaseSeeder original, sem alterar nenhuma regra do legado.
 *
 * Limite conhecido: as datas do Faker ('0 years' .. '+2 years') são relativas ao dia do seed.
 */
class DeterministicSeeder extends Seeder
{
    public function run()
    {
        $seed = (int) env('LEGACY_SEED_VALUE', 42);

        mt_srand($seed);
        app(Faker\Generator::class)->seed($seed);

        $this->call(DatabaseSeeder::class);
    }
}
