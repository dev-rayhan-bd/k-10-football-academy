import { IUser, IUserDocument } from './user.interface';
import { UserModel } from './user.model';

export class UserRepository {
  async create(userData: Partial<IUser>): Promise<IUserDocument> {
    return UserModel.create(userData);
  }

  async findByEmail(email: string, includePassword = false): Promise<IUserDocument | null> {
    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const query = UserModel.findOne({ email: normalizedEmail });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id: string): Promise<IUserDocument | null> {
    return UserModel.findById(id).exec();
  }

  async findAll(filter: Record<string, unknown> = {}): Promise<IUserDocument[]> {
    return UserModel.find(filter).exec();
  }

  async updateById(id: string, updateData: Partial<IUser>): Promise<IUserDocument | null> {
    return UserModel.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).exec();
  }

  async deleteById(id: string): Promise<IUserDocument | null> {
    return UserModel.findByIdAndDelete(id).exec();
  }
}

export const userRepository = new UserRepository();
