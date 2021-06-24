import {IsNotEmpty, IsOptional, IsUUID, Length, Max, Min, ValidateIf} from 'class-validator';

export class CreateTronTrc20 {

    @ValidateIf(o => !(o.from || o.signatureId))
    @IsNotEmpty()
    @Length(64, 64)
    public fromPrivateKey?: string;

    @ValidateIf(o => !o.fromPrivateKey)
    @IsNotEmpty()
    @Length(34, 34)
    public from?: string;

    @ValidateIf(o => !o.fromPrivateKey)
    @Length(36, 36)
    @IsUUID('4')
    @IsNotEmpty()
    public signatureId?: string;

    @ValidateIf(o => o.signatureId)
    @IsOptional()
    @Min(0)
    public index?: number;

    @IsNotEmpty()
    @Length(1, 100)
    public name: string;

    @IsNotEmpty()
    @Length(34, 34)
    public recipient: string;

    @IsNotEmpty()
    @Length(1, 100)
    public symbol: string;

    @IsNotEmpty()
    @Min(0)
    public totalSupply: number;

    @IsNotEmpty()
    @Min(0)
    @Max(30)
    public decimals: number;
}
