import logger from "../configs/winston.config";
import { IUser, UserModel } from "../models/user.model";
import bcrypt from "bcrypt";

export class UserRepository {
  public async createUser(
    body: IUser,
  ): Promise<Omit<IUser, "password"> | null> {
    try {
      const { firstName, lastName, email, password, userRole } = body;

      console.log("createUser : Creating user", body);

      // first encrypt the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      let user = new UserModel({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        userRole,
        isDeleted: false,
      });

      if (!user) {
        console.error("createUser : Unable to create user");
        logger.error("createUser : Unable to create user");
        return null;
      }

      await user.save();

      const { password: pass, ...sanitizedUser } = user?.toObject();
      logger.info("createUser : User created successfully");
      return sanitizedUser as Omit<IUser, "password">;

    } catch (err: any) {
      console.error("CreateUser : Unable to create user" + err?.message);
      logger.error("CreateUser : Unable to create user" + err?.message);
      throw new Error(err?.message);
    }
  }

  public async getUserByKey(key: string, value: string): Promise<IUser | null> {
    try {
      const user = await UserModel.findOne({ [key]: value, isDeleted: false }).populate('userRole');

      if (!user) {
        console.error(
          `getUserByKey : User with ${key} ${value} does not exist`,
        );
        logger.error(`getUserByKey : User with ${key} ${value} does not exist`);
        return null;
      }

      return user;
    } catch (err: any) {
      console.error("getUserByKey : Unable to get user" + err?.message);
      logger.error("getUserByKey : Unable to get user" + err?.message);
      throw new Error(err?.message);
    }
  }

  public async updateUser(email: string, body: Partial<IUser>) {
    try {

      // hash password if it is being updated
      if (body?.password) {
        const salt = await bcrypt.genSalt(10);
        body.password = await bcrypt.hash(body.password, salt);
      }

      console.log("user body", body);

      const updatedUser = await UserModel.findOneAndUpdate(
        {
          email: email.toLowerCase(),
        },
        {
          $set: body,
        },
        {
          new: true,
        },
      );

      console.log("updated user", updatedUser);

      return updatedUser;

    } catch (err: any) {
      console.error("updateUser : Unable to update user" + err?.message);
      logger.error("updateUser : Unable to update user" + err?.message);
      throw new Error(err?.message);
    }
  }

  public async deleteUser(email: string): Promise<IUser | null> {
    try {
      console.log("deleting user...");
      const deletedUser = await UserModel.findOneAndUpdate({ email, isDeleted: false }, { isDeleted: true });
      console.log("user deleted", deletedUser);
      return deletedUser;
    } catch (err: any) {
      console.error("deleteUser : Unable to delete user" + err?.message);
      logger.error("deleteUser : Unable to delete user" + err?.message);
      throw new Error(err?.message);
    }
  }

  public async createUserForGroupLeader(
    body: Omit<IUser, "password">
  ): Promise<Omit<IUser, "password"> | null> {
    try {
      const { firstName, lastName, email, userRole } = body;
  
      console.log("Creating user for group leader", body);
  
      // Generate a random temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
  
      let user = new UserModel({
        firstName,
        lastName,
        email,
        password: tempPassword,
        userRole,
        isDeleted: false,
      });
  
      if (!user) {
        console.error("Unable to create user");
        return null;
      }
  
      await user.save();
  
      const { password: pass, ...sanitizedUser } = user?.toObject();
  
      console.log("User created successfully");
      return sanitizedUser;
  
    } catch (err: any) {
      console.error("Error creating user for group leader:", err?.message);
      throw new Error(err?.message);
    }
  }

  public async updateToken(id:string, accessToken:string,refreshToken:string): Promise<IUser | any> {
    try {
    
      const user:IUser | null= await UserModel.findOneAndUpdate({_id: id},{$set : {accessToken,refreshToken} },{new:true}).populate('userRole');
      console.log("User after update>>",user);
      if(user){
        return user;
      } else {
        return false;
      }

    } catch (err:any) {
      console.error("Update Token : Unable to update token" + err?.message);
      logger.error("Update Token : Unable to update token" + err?.message);
      throw new Error(err?.message);
    }

  }

  public async unverifyGroupLeader(id:string){
    try{

      const user:IUser | null= await UserModel.findOneAndUpdate({_id: id},{$set : {isVerified:false} },{new:true});
      if(user){
        return user;
      } else {
        return null;
      }

    } catch(error:any) {
      throw new Error(error)
    }

  }
}
