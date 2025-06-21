import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1750509167632 implements MigrationInterface {
    name = 'Migration1750509167632'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "refreshToken" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refreshToken"`);
    }

}
